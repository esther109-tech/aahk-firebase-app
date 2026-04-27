"use client";

import React, { useState, useEffect } from "react";
import { storage, db, auth } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileCheck, Loader2, AlertCircle, CheckCircle2, Mail, FileText, Image as ImageIcon } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function UploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [notifyEmail, setNotifyEmail] = useState("");

    // Cleanup preview URL on unmount or file change
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

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
            setError("Unsupported format. Please upload .docx, .png, or .jpg.");
            setFile(null);
            setPreviewUrl(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) validateAndSetFile(selectedFile);
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

                    // 3. Create Firestore record
                    await addDoc(collection(db, "airline-upload"), {
                        file_name: file.name,
                        file_content: downloadURL,
                        userEmail: auth.currentUser?.email || "esther.shih@microfusion.cloud",
                        recipientEmail: notifyEmail || "esther.shih@microfusion.cloud",
                        status: "Pending Review",
                        createdAt: serverTimestamp(),
                        fileType: file.type.startsWith("image/") ? "image" : "document"
                    });

                    // 4. Trigger Email Notification via HTTPS Function
                    try {
                        const userToken = await auth.currentUser?.getIdToken();
                        await fetch("https://asia-east1-gcp-tw-sandbox.cloudfunctions.net/onAirlineUpdateCreated", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${userToken}`
                            },
                            body: JSON.stringify({
                                file_name: file.name,
                                fileType: file.type.startsWith("image/") ? "image" : "document",
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
            setError("An unexpected error occurred.");
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
                        {previewUrl ? (
                            <div className="relative w-48 h-48 rounded-2xl border-4 border-white shadow-lg overflow-hidden animate-in zoom-in-95 duration-500">
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                                    <ImageIcon className="text-white w-8 h-8 drop-shadow-md" />
                                </div>
                            </div>
                        ) : (
                            <div className={cn(
                                "p-6 rounded-full transition-colors duration-300",
                                status === "success" ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-400 group-hover:text-slate-500 border border-slate-200"
                            )}>
                                {status === "uploading" ? (
                                    <Loader2 className="w-10 h-10 animate-spin" />
                                ) : status === "success" ? (
                                    <CheckCircle2 className="w-10 h-10" />
                                ) : file ? (
                                    <FileCheck className="w-10 h-10" />
                                ) : (
                                    <Upload className="w-10 h-10" />
                                )}
                            </div>
                        )}

                        <div className="space-y-1">
                            {file ? (
                                <p className="text-slate-900 font-bold tracking-tight truncate max-w-xs">{file.name}</p>
                            ) : (
                                <>
                                    <p className="text-slate-900 font-bold">Click or drag to supply asset</p>
                                    <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-semibold">Docs or Images (.png, .jpg)</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

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
