"use client";

import React, { useState, useEffect } from "react";
import { storage, db, auth } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { writeAuditEvent } from "@/lib/audit";
import { getAirlineFromEmail } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { loadGoogleScripts, requestGoogleAccessToken, openGooglePicker } from "@/lib/googleDrive";
import { 
    Upload, 
    FileCheck, 
    Loader2, 
    AlertCircle, 
    CheckCircle2, 
    Mail, 
    FileText, 
    Image as ImageIcon,
    HardDrive,
    Settings,
    X,
    Key,
    Database,
    CloudLightning,
    Check
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const DEFAULT_API_KEY = "AIzaSyAaYbqcGRhVmDTkFre4AkpP_tYx-Ns7EP4";

export default function UploadForm() {
    const [uploadSource, setUploadSource] = useState<"local" | "drive">("local");
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error" | "downloading">("idle");
    const [customStatusText, setCustomStatusText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notifyEmail, setNotifyEmail] = useState("");

    // Google Drive Specific State
    const [driveToken, setDriveToken] = useState<string | null>(null);
    const [clientId, setClientId] = useState("");
    const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
    const [showSettings, setShowSettings] = useState(false);
    const [isScriptsLoaded, setIsScriptsLoaded] = useState(false);
    const [loadingScripts, setLoadingScripts] = useState(false);

    // Load Client ID and API Key from localStorage or Env on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedClientId = localStorage.getItem("skygate_google_client_id");
            if (savedClientId) {
                setClientId(savedClientId);
            } else {
                setClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "");
            }

            const savedApiKey = localStorage.getItem("skygate_google_api_key");
            if (savedApiKey) {
                setApiKey(savedApiKey);
            } else {
                setApiKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY || DEFAULT_API_KEY);
            }
        }
    }, []);

    // Cleanup preview URL on unmount or file change
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleSaveSettings = (newClientId: string, newApiKey: string) => {
        setClientId(newClientId);
        setApiKey(newApiKey);
        if (typeof window !== "undefined") {
            localStorage.setItem("skygate_google_client_id", newClientId);
            localStorage.setItem("skygate_google_api_key", newApiKey);
        }
        setShowSettings(false);
        setError(null);
    };

    const validateAndSetFile = (selectedFile: File) => {
        const isDocx =
            selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            selectedFile.name.toLowerCase().endsWith(".docx");
        const isImage = selectedFile.type.startsWith("image/") &&
            (selectedFile.name.toLowerCase().endsWith(".png") ||
                selectedFile.name.toLowerCase().endsWith(".jpg") ||
                selectedFile.name.toLowerCase().endsWith(".jpeg"));

        if (isDocx || isImage) {
            setFile(selectedFile);
            setError(null);

            if (isImage) {
                const url = URL.createObjectURL(selectedFile);
                setPreviewUrl(url);
            } else {
                setPreviewUrl(null);
            }
        } else {
            setError("Unsupported format. Please supply a .docx, .png, or .jpg file.");
            setFile(null);
            setPreviewUrl(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) validateAndSetFile(selectedFile);
    };

    // Lazy load SDKs and authenticate Drive
    const handleConnectDrive = async () => {
        if (!clientId) {
            setError("Please configure a valid Google Client ID first.");
            setShowSettings(true);
            return;
        }

        setLoadingScripts(true);
        setError(null);
        try {
            await loadGoogleScripts();
            setIsScriptsLoaded(true);
            
            const token = await requestGoogleAccessToken(clientId);
            setDriveToken(token);
        } catch (err: any) {
            console.error("Google Drive connection error:", err);
            setError(err.message || "Authentication with Google Drive failed.");
        } finally {
            setLoadingScripts(false);
        }
    };

    const handleDisconnectDrive = () => {
        setDriveToken(null);
    };

    // Launch Picker and fetch file
    const handleBrowseDrive = () => {
        if (!driveToken) return;

        openGooglePicker({
            apiKey: apiKey,
            accessToken: driveToken,
            onSelect: async ({ id, name, mimeType }) => {
                setStatus("downloading");
                setCustomStatusText(`Downloading "${name}" from Drive...`);
                setError(null);

                try {
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
                        headers: {
                            Authorization: `Bearer ${driveToken}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to download: ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    const driveFile = new File([blob], name, { type: mimeType });
                    validateAndSetFile(driveFile);
                    setStatus("idle");
                    setCustomStatusText(null);
                } catch (err: any) {
                    console.error("Drive download error:", err);
                    setError(`Failed to retrieve file from Google Drive: ${err.message || "Unknown error"}`);
                    setStatus("error");
                    setCustomStatusText(null);
                }
            },
            onCancel: () => {
                console.log("Picker cancelled.");
            }
        });
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setStatus("uploading");
        setError(null);

        try {
            // 1. Upload to Storage
            const storageRef = ref(storage, `airline_updates/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on(
                "state_changed",
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(progress);
                },
                (error) => {
                    console.error("Storage upload error:", error);
                    setError("Failed to upload file to storage.");
                    setStatus("error");
                    setUploading(false);
                },
                async () => {
                    // 2. Get Download URL
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                    const userEmail = auth.currentUser?.email || "esther.shih@microfusion.cloud";
                    const airlineName = getAirlineFromEmail(userEmail);

                    // 3. Create Firestore record
                    const fileType = file.type.startsWith("image/") ? "image" : "document";
                    const docRef = await addDoc(collection(db, "airline-upload"), {
                        file_name: file.name,
                        file_content: downloadURL,
                        userEmail: userEmail,
                        airlineName: airlineName,
                        recipientEmail: notifyEmail || "esther.shih@microfusion.cloud",
                        status: "Pending Review",
                        createdAt: serverTimestamp(),
                        fileType,
                    });

                    // Write audit event for submission creation
                    const currentUser = auth.currentUser;
                    if (currentUser) {
                        await writeAuditEvent({
                            submissionId: docRef.id,
                            airlineName: airlineName,
                            action: "submission.created",
                            actor: {
                                uid: currentUser.uid,
                                email: currentUser.email!,
                                displayName: currentUser.displayName || currentUser.email!,
                            },
                            metadata: { fileName: file.name, fileType },
                        });
                    }

                    // 4. Trigger Email Notification via HTTPS Function
                    try {
                        const userToken = await auth.currentUser?.getIdToken();
                        const functionsUrl = process.env.NEXT_PUBLIC_AIRLINE_UPDATE_CREATED_URL || "https://asia-east1-gcp-tw-sandbox.cloudfunctions.net/onAirlineUpdateCreated";
                        await fetch(functionsUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${userToken}`
                            },
                            body: JSON.stringify({
                                file_name: file.name,
                                fileType,
                                userEmail: auth.currentUser?.email || "esther.shih@microfusion.cloud",
                                recipientEmail: notifyEmail || "esther.shih@microfusion.cloud",
                                status: "Pending Review",
                                file_content: downloadURL
                            })
                        });
                    } catch (emailErr) {
                        console.error("Email notification trigger failed:", emailErr);
                    }

                    setStatus("success");
                    setUploading(false);
                    setFile(null);
                    setPreviewUrl(null);
                    setProgress(0);
                }
            );
        } catch (err) {
            console.error("Upload error:", err);
            setError("An unexpected error occurred during submit.");
            setStatus("error");
            setUploading(false);
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto p-8 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50">
            <div className="space-y-6">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold text-slate-900">Upload Fleet Update</h2>
                    <p className="text-slate-500 mt-1">Submit airline documents or fleet imagery</p>
                </div>

                {/* Source Selection Toggle */}
                {!file && status !== "success" && (
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
                        <button
                            onClick={() => { setUploadSource("local"); setError(null); }}
                            className={cn(
                                "flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-200",
                                uploadSource === "local"
                                    ? "bg-white text-slate-900 shadow-md shadow-slate-200/40"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            <Upload className="w-4 h-4" />
                            <span>Local File</span>
                        </button>
                        <button
                            onClick={() => { setUploadSource("drive"); setError(null); }}
                            className={cn(
                                "flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-200",
                                uploadSource === "drive"
                                    ? "bg-white text-slate-900 shadow-md shadow-slate-200/40"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            <HardDrive className="w-4 h-4" />
                            <span>Google Drive</span>
                        </button>
                    </div>
                )}

                {/* Main Content Area */}
                {file ? (
                    /* Unified Selected File Card */
                    <div className="p-6 rounded-2xl border-2 border-emerald-500 bg-emerald-50/20 text-center space-y-4 animate-in zoom-in-95 duration-300">
                        {previewUrl ? (
                            <div className="relative w-48 h-48 rounded-xl border-4 border-white shadow-md overflow-hidden mx-auto">
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                                    <ImageIcon className="text-white w-8 h-8 drop-shadow-sm" />
                                </div>
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-white border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                                <FileText className="w-8 h-8" />
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Active Import</p>
                            <p className="text-slate-900 font-extrabold text-lg truncate max-w-sm mx-auto">{file.name}</p>
                        </div>
                        <button
                            onClick={() => { setFile(null); setPreviewUrl(null); }}
                            className="text-rose-500 hover:text-rose-600 text-xs font-bold uppercase tracking-widest hover:underline transition-all flex items-center justify-center mx-auto space-x-1"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Remove Selection</span>
                        </button>
                    </div>
                ) : status === "downloading" ? (
                    /* Google Drive Loader */
                    <div className="min-h-[300px] border border-slate-200 bg-slate-50/50 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4 animate-pulse">
                        <div className="p-4 bg-white rounded-full shadow-md border border-slate-100">
                            <Loader2 className="w-10 h-10 animate-spin text-slate-800" />
                        </div>
                        <p className="text-slate-800 font-bold text-lg">{customStatusText}</p>
                        <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold">Streaming to uploader buffer</p>
                    </div>
                ) : uploadSource === "local" ? (
                    /* Local Dropzone */
                    <div
                        className={cn(
                            "relative group cursor-pointer border-2 border-dashed rounded-2xl overflow-hidden transition-all duration-300 min-h-[300px] flex items-center justify-center",
                            status === "success" ? "border-emerald-500 bg-emerald-50" : "border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50"
                        )}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const droppedFile = e.dataTransfer.files[0];
                            if (droppedFile) validateAndSetFile(droppedFile);
                        }}
                    >
                        <input
                            type="file"
                            accept=".docx,.png,.jpg,.jpeg"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                            disabled={uploading}
                        />

                        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center space-y-4">
                            <div className={cn(
                                "p-6 rounded-full transition-colors duration-300 bg-white border border-slate-200 shadow-sm text-slate-400 group-hover:text-slate-500"
                            )}>
                                <Upload className="w-10 h-10" />
                            </div>

                            <div className="space-y-1">
                                <p className="text-slate-900 font-bold">Click or drag to supply asset</p>
                                <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-semibold">Docs or Images (.png, .jpg)</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Google Drive Section */
                    <div className="border border-slate-200 bg-slate-50/50 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col justify-between">
                        {!driveToken ? (
                            /* Drive Log In */
                            <div className="flex flex-col items-center justify-center space-y-5 my-auto">
                                <div className="p-5 bg-white border border-slate-100 rounded-full shadow-md text-amber-500">
                                    <Database className="w-10 h-10" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-slate-900">Google Drive Integration</h3>
                                    <p className="text-slate-500 text-xs max-w-sm mx-auto">Access files and assets securely from your cloud drive directory</p>
                                </div>

                                <button
                                    onClick={handleConnectDrive}
                                    disabled={loadingScripts}
                                    className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all shadow-md shadow-amber-500/15 flex items-center space-x-2 text-sm disabled:opacity-50"
                                >
                                    {loadingScripts ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Authenticating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CloudLightning className="w-4 h-4" />
                                            <span>Connect Google Drive</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            /* Drive Browsing Card */
                            <div className="flex flex-col items-center justify-center space-y-5 my-auto">
                                <div className="p-5 bg-emerald-500 text-white rounded-full shadow-md shadow-emerald-500/10">
                                    <FileCheck className="w-10 h-10" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-center space-x-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <h3 className="text-lg font-bold text-slate-900">Google Drive Connected</h3>
                                    </div>
                                    <p className="text-slate-500 text-xs">Browse documents and images using official Google Picker</p>
                                </div>

                                <div className="flex space-x-3">
                                    <button
                                        onClick={handleBrowseDrive}
                                        className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md text-sm"
                                    >
                                        Browse Cloud Files
                                    </button>
                                    <button
                                        onClick={handleDisconnectDrive}
                                        className="px-4 py-3.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl font-semibold transition-all text-sm"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Expandable Settings Gear */}
                        <div className="mt-4 border-t border-slate-200/60 pt-4 flex flex-col items-center">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest flex items-center space-x-1.5 transition-colors"
                            >
                                <Settings className="w-4 h-4" />
                                <span>Settings & Credentials</span>
                            </button>

                            <AnimatePresence>
                                {showSettings && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="w-full text-left space-y-4 mt-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-inner"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center space-x-1">
                                                <Key className="w-3.5 h-3.5" />
                                                <span>Google credentials</span>
                                            </span>
                                            <button onClick={() => setShowSettings(false)}>
                                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                            Enable the <strong>Google Picker API</strong> on GCP Console. To avoid restriction blocks, supply an unrestricted API developer Key and Client ID below.
                                        </p>
                                        
                                        <div className="space-y-3">
                                            {/* Client ID Field */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">OAuth Client ID</label>
                                                <input
                                                    type="text"
                                                    defaultValue={clientId}
                                                    id="client_id_input"
                                                    placeholder="593899410363-xxx.apps.googleusercontent.com"
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                                                />
                                            </div>

                                            {/* API Key Field */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Developer API Key</label>
                                                <input
                                                    type="text"
                                                    defaultValue={apiKey}
                                                    id="api_key_input"
                                                    placeholder="AIzaSy..."
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                                                />
                                            </div>

                                            <button
                                                onClick={() => {
                                                    const clientIdVal = (document.getElementById("client_id_input") as HTMLInputElement)?.value.trim() || "";
                                                    const apiKeyVal = (document.getElementById("api_key_input") as HTMLInputElement)?.value.trim() || "";
                                                    handleSaveSettings(clientIdVal, apiKeyVal);
                                                }}
                                                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Save credentials</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {/* Email Notification & Submit Logic */}
                <AnimatePresence>
                    {file && status !== "success" && (
                        <motion.div
                            key="notify-recipient"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-3 border-t border-slate-100 pt-6 mt-6"
                        >
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center space-x-2">
                                <Mail className="w-3.5 h-3.5" />
                                <span>Notification Target</span>
                            </label>
                            <input
                                type="email"
                                value={notifyEmail}
                                onChange={(e) => setNotifyEmail(e.target.value)}
                                placeholder="Colleague's email or AAHK contact"
                                className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all text-sm bg-slate-50/50"
                                disabled={uploading}
                            />
                        </motion.div>
                    )}

                    {error && (
                        <motion.div
                            key="upload-error"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center space-x-3 text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100"
                        >
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-semibold">{error}</p>
                        </motion.div>
                    )}

                    {status === "success" && (
                        <motion.div
                            key="upload-success"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-center space-x-3 text-emerald-700 bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm"
                        >
                            <CheckCircle2 className="w-6 h-6" />
                            <p className="font-bold">Fleet update finalized and logged!</p>
                        </motion.div>
                    )}

                    {uploading && (
                        <div className="space-y-3">
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
                                <motion.div
                                    key="upload-progress"
                                    className="h-full bg-slate-900 shadow-[0_0_10px_rgba(0,0,0,0.2)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                                <span>Securing Assets...</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                        </div>
                    )}
                </AnimatePresence>

                <button
                    onClick={handleUpload}
                    disabled={!file || uploading || status === "success"}
                    className={cn(
                        "w-full py-5 px-6 rounded-2xl font-bold transition-all duration-300 flex items-center justify-center space-x-3 text-lg",
                        !file || uploading || status === "success"
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-2xl shadow-slate-900/30"
                    )}
                >
                    {uploading ? (
                        <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Processing...</span>
                        </>
                    ) : status === "success" ? (
                        <span>Verified</span>
                    ) : (
                        <>
                            <Upload className="w-5 h-5" />
                            <span>Submit Update</span>
                        </>
                    )}
                </button>

                {status === "success" && (
                    <button
                        onClick={() => setStatus("idle")}
                        className="w-full py-2 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-900 transition-colors"
                    >
                        Prepare Another Submission
                    </button>
                )}
            </div>
        </div>
    );
}
