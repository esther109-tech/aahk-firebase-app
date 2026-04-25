"use client";

import React, { useState } from "react";
import { storage, db, auth } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileCheck, Loader2, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function UploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [notifyEmail, setNotifyEmail] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        console.log("File selected:", selectedFile?.name, "Type:", selectedFile?.type);
        if (selectedFile) {
            const isDocx =
                selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                selectedFile.name.toLowerCase().endsWith(".docx");

            console.log("Is Docx?", isDocx);

            if (isDocx) {
                setFile(selectedFile);
                setError(null);
            } else {
                setError("Please upload a .docx file.");
                setFile(null);
            }
        }
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
                        fie_name: file.name,
                        file_content: downloadURL, // Mapping download URL to file_content as per user's field
                        userEmail: auth.currentUser?.email || "anonymous-user@example.com",
                        recipientEmail: notifyEmail || "esther.shih@microfusion.cloud",
                        status: "Pending Review",
                        createdAt: serverTimestamp(),
                    });

                    setStatus("success");
                    setUploading(false);
                    setFile(null);
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
                    <h2 className="text-2xl font-semibold text-slate-900">Upload Airline Update</h2>
                    <p className="text-slate-500 mt-1">Submit your .docx airline information update form</p>
                </div>

                <div
                    className={cn(
                        "relative group cursor-pointer border-2 border-dashed rounded-xl p-12 transition-all duration-300",
                        status === "success" ? "border-emerald-500 bg-emerald-50" : "border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50"
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const droppedFile = e.dataTransfer.files[0];
                        console.log("File dropped:", droppedFile?.name, "Type:", droppedFile?.type);
                        if (droppedFile) {
                            const isDocx = droppedFile.name.toLowerCase().endsWith(".docx");
                            console.log("Is Docx (drop)?", isDocx);
                            if (isDocx) {
                                setFile(droppedFile);
                                setError(null);
                            } else {
                                setError("Please upload a .docx file.");
                            }
                        }
                    }}
                >
                    <input
                        type="file"
                        accept=".docx"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        disabled={uploading}
                    />

                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className={cn(
                            "p-4 rounded-full transition-colors duration-300",
                            status === "success" ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-400 group-hover:text-slate-500"
                        )}>
                            {status === "uploading" ? (
                                <Loader2 className="w-8 h-8 animate-spin" />
                            ) : status === "success" ? (
                                <CheckCircle2 className="w-8 h-8" />
                            ) : file ? (
                                <FileCheck className="w-8 h-8" />
                            ) : (
                                <Upload className="w-8 h-8" />
                            )}
                        </div>

                        <div className="text-center">
                            {file ? (
                                <p className="text-slate-700 font-medium truncate max-w-xs">{file.name}</p>
                            ) : (
                                <>
                                    <p className="text-slate-700 font-medium">Click or drag to upload</p>
                                    <p className="text-slate-400 text-sm mt-1">Microsoft Word (.docx) only</p>
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
                            className="space-y-2 border-t border-slate-100 pt-6 mt-6"
                        >
                            <label className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                                <Mail className="w-4 h-4" />
                                <span>Notify Recipient (Optional)</span>
                            </label>
                            <input
                                type="email"
                                value={notifyEmail}
                                onChange={(e) => setNotifyEmail(e.target.value)}
                                placeholder="Colleague's email or AAHK contact"
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all text-sm"
                                disabled={uploading}
                            />
                            <p className="text-[10px] text-slate-400 italic">Leave blank to notify the default AAHK department.</p>
                        </motion.div>
                    )}

                    {error && (
                        <motion.div
                            key="upload-error"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center space-x-2 text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-100"
                        >
                            <AlertCircle className="w-4 h-4" />
                            <p className="text-sm font-medium">{error}</p>
                        </motion.div>
                    )}

                    {status === "success" && (
                        <motion.div
                            key="upload-success"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center justify-center space-x-2 text-emerald-700 bg-emerald-50 p-4 rounded-lg border border-emerald-100"
                        >
                            <CheckCircle2 className="w-5 h-5" />
                            <p className="font-semibold">Update submitted successfully!</p>
                        </motion.div>
                    )}

                    {uploading && (
                        <div className="space-y-2">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <motion.div
                                    key="upload-progress"
                                    className="h-full bg-slate-900"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-xs text-right text-slate-500 font-mono italic">
                                Uploading... {Math.round(progress)}%
                            </p>
                        </div>
                    )}
                </AnimatePresence>

                <button
                    onClick={handleUpload}
                    disabled={!file || uploading || status === "success"}
                    className={cn(
                        "w-full py-4 px-6 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center space-x-2",
                        !file || uploading || status === "success"
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-lg shadow-slate-900/20"
                    )}
                >
                    {uploading ? "Uploading..." : status === "success" ? "Submitted" : "Submit Update"}
                </button>

                {status === "success" && (
                    <button
                        onClick={() => setStatus("idle")}
                        className="w-full py-2 text-slate-500 text-sm hover:text-slate-700 transition-colors"
                    >
                        Upload another file
                    </button>
                )}
            </div>
        </div>
    );
}
