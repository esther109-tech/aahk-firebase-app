"use client";

import React, { useState, useEffect } from "react";
import AuditTrail from "@/components/AuditTrail";
import { writeAuditEvent } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { isUserAdmin } from "@/lib/utils";
import {
    FileText, Image as ImageIcon, Eye, Clock, AlertTriangle, CheckCircle2,
    X, Sparkles, Loader2, Calendar, Layers, Percent, Check,
    ChevronDown, Trash2, MessageSquare, Send, ShieldCheck, Plane, User2,
} from "lucide-react";

interface Props {
    submission: any;
    user: any;
    isAdmin: boolean;
    onClose: () => void;
    onStatusChange?: (newStatus: string) => void;
}

export default function AuditDrawer({ submission, user, isAdmin, onClose, onStatusChange }: Props) {
    const [drawerTab, setDrawerTab] = useState<"details" | "comments" | "audit">("details");
    const [comments, setComments] = useState<any[]>([]);
    const [commentInput, setCommentInput] = useState("");
    const [postingComment, setPostingComment] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
    const [currentSubmission, setCurrentSubmission] = useState(submission);

    useEffect(() => { setCurrentSubmission(submission); setDrawerTab("details"); setCommentInput(""); }, [submission?.id]);

    useEffect(() => {
        if (!currentSubmission?.id) return;
        const q = query(collection(db, "airline-upload", currentSubmission.id, "comments"), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    }, [currentSubmission?.id]);

    const handlePostComment = async () => {
        if (!commentInput.trim() || !currentSubmission?.id || !user?.email) return;
        setPostingComment(true);
        try {
            await addDoc(collection(db, "airline-upload", currentSubmission.id, "comments"), {
                text: commentInput.trim(),
                authorEmail: user.email,
                authorName: user.displayName || user.email.split("@")[0],
                createdAt: serverTimestamp(),
            });
            await writeAuditEvent({
                submissionId: currentSubmission.id,
                airlineName: currentSubmission.airlineName || "",
                action: "submission.comment_added",
                actor: { uid: user.uid, email: user.email, displayName: user.displayName || user.email },
                metadata: { commentPreview: commentInput.trim().slice(0, 80) },
            });
            setCommentInput("");
        } catch (err) { console.error("Failed to post comment", err); }
        finally { setPostingComment(false); }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!currentSubmission?.id) return;
        await deleteDoc(doc(db, "airline-upload", currentSubmission.id, "comments", commentId)).catch(console.error);
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!currentSubmission?.id || !isAdmin) return;
        setUpdatingStatus(true);
        try {
            await updateDoc(doc(db, "airline-upload", currentSubmission.id), { status: newStatus });
            await writeAuditEvent({
                submissionId: currentSubmission.id,
                airlineName: currentSubmission.airlineName || "",
                action: "submission.status_changed",
                actor: { uid: user.uid, email: user.email, displayName: user.displayName || user.email },
                metadata: { from: currentSubmission.status, to: newStatus },
            });
            setCurrentSubmission((prev: any) => ({ ...prev, status: newStatus }));
            onStatusChange?.(newStatus);
            setStatusDropdownOpen(false);
        } catch (err) { console.error("Failed to update status", err); }
        finally { setUpdatingStatus(false); }
    };

    return (
        <AnimatePresence>
            <>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40"
                />
                <motion.div
                    initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 32, stiffness: 280 }}
                    className="fixed right-0 top-0 h-full w-full max-w-lg bg-white/95 backdrop-blur-xl shadow-2xl z-50 border-l border-slate-200 overflow-y-auto flex flex-col"
                >
                    {/* Header */}
                    <div className="border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10">
                        <div className="p-5 flex items-center justify-between">
                            <div className="flex items-center space-x-2.5">
                                <div className="p-2 rounded-xl bg-slate-900 text-white"><Sparkles className="w-4 h-4" /></div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">AI Compliance Audit</h3>
                                    <p className="text-xs text-slate-400 truncate max-w-[200px]">Ref: {currentSubmission.id}</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                {isAdmin && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                                            disabled={updatingStatus}
                                            className={`inline-flex items-center space-x-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                                                currentSubmission.status === "Approved" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                : currentSubmission.status === "Action Required" ? "bg-rose-50 border-rose-200 text-rose-700"
                                                : currentSubmission.status === "Under Review" ? "bg-amber-50 border-amber-200 text-amber-700"
                                                : "bg-slate-50 border-slate-200 text-slate-600"
                                            }`}
                                        >
                                            {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                            <span>{currentSubmission.status || "Pending"}</span>
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                        {statusDropdownOpen && (
                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                                {["Pending", "Under Review", "Approved", "Action Required"].map((status) => (
                                                    <button key={status} onClick={() => handleStatusChange(status)}
                                                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center space-x-2 transition-colors ${currentSubmission.status === status ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                                                    >
                                                        {status === "Approved" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        {status === "Action Required" && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                                                        {status === "Under Review" && <Eye className="w-3.5 h-3.5 text-amber-500" />}
                                                        {status === "Pending" && <Clock className="w-3.5 h-3.5 text-slate-400" />}
                                                        <span>{status}</span>
                                                        {currentSubmission.status === status && <Check className="w-3 h-3 ml-auto text-slate-900" />}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex px-5 -mb-px">
                            {(["details", "comments", ...(isAdmin ? ["audit"] : [])] as const).map((tab) => (
                                <button key={tab} onClick={() => setDrawerTab(tab as any)}
                                    className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors capitalize ${drawerTab === tab ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                                >
                                    {tab === "details" && <FileText className="w-3.5 h-3.5" />}
                                    {tab === "comments" && <MessageSquare className="w-3.5 h-3.5" />}
                                    {tab === "audit" && <ShieldCheck className="w-3.5 h-3.5" />}
                                    <span>{tab === "details" ? "Audit Details" : tab === "comments" ? "Comments" : "Audit Trail"}</span>
                                    {tab === "comments" && comments.length > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100 text-indigo-700">{comments.length}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Details Tab */}
                    {drawerTab === "details" && (
                        <div className="p-6 space-y-6 flex-grow overflow-y-auto">
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submitted Asset</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 shadow-xs">
                                            {currentSubmission.fileType === "image" ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                        </div>
                                        <div className="max-w-[240px]">
                                            <p className="font-bold text-slate-900 text-sm truncate">{currentSubmission.file_name}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">By {currentSubmission.userEmail}</p>
                                        </div>
                                    </div>
                                    {currentSubmission.file_content && currentSubmission.file_content !== "#" && (
                                        <a href={currentSubmission.file_content} target="_blank" rel="noreferrer"
                                            className="text-xs font-bold text-indigo-600 hover:underline flex items-center bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg">
                                            View Original
                                        </a>
                                    )}
                                </div>
                            </div>

                            {!currentSubmission.ai_extracted ? (
                                <div className="p-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                    <h4 className="font-bold text-indigo-900 text-sm">Gemini AI Audit Running...</h4>
                                    <p className="text-xs text-indigo-600 max-w-xs leading-relaxed">Performing OCR extraction and analyzing compliance guidelines.</p>
                                </div>
                            ) : (
                                <>
                                    {currentSubmission.extractedData?.complianceStatus === "Passed" ? (
                                        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 flex items-start space-x-4">
                                            <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0"><CheckCircle2 className="w-6 h-6" /></div>
                                            <div>
                                                <h4 className="font-extrabold text-emerald-950">Aviation Compliance Passed</h4>
                                                <p className="text-xs text-emerald-700 leading-relaxed mt-1">{currentSubmission.extractedData?.complianceReason || "Complies with all AAHK safety guidelines."}</p>
                                            </div>
                                        </div>
                                    ) : currentSubmission.extractedData?.complianceStatus === "Action Required" ? (
                                        <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/60 flex items-start space-x-4">
                                            <div className="p-2.5 rounded-full bg-rose-100 text-rose-600 flex-shrink-0"><AlertTriangle className="w-6 h-6" /></div>
                                            <div>
                                                <h4 className="font-extrabold text-rose-950">Audit Flags Raised</h4>
                                                <p className="text-xs text-rose-700 leading-relaxed mt-1">{currentSubmission.extractedData?.complianceReason || "Review required."}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start space-x-4">
                                            <div className="p-2.5 rounded-full bg-slate-200 text-slate-600 flex-shrink-0"><AlertTriangle className="w-6 h-6" /></div>
                                            <div>
                                                <h4 className="font-extrabold text-slate-800">Incomplete Audit Details</h4>
                                                <p className="text-xs text-slate-600 leading-relaxed mt-1">Manual administrator review requested.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extracted Metadata</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[
                                                { icon: <Plane className="w-4 h-4 text-indigo-500" />, label: "Airline", value: currentSubmission.extractedData?.airlineName },
                                                { icon: <Layers className="w-4 h-4 text-indigo-500" />, label: "Model", value: currentSubmission.extractedData?.aircraftModel },
                                                { icon: <ShieldCheck className="w-4 h-4 text-indigo-500" />, label: "Tail Number", value: currentSubmission.extractedData?.tailNumber },
                                                { icon: <Calendar className="w-4 h-4 text-indigo-500" />, label: "Report Date", value: currentSubmission.extractedData?.updateDate },
                                            ].map(({ icon, label, value }) => (
                                                <div key={label} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-3">
                                                    {icon}
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
                                                        <p className="font-bold text-slate-900 text-sm">{value || "Unknown"}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                <Percent className="w-3.5 h-3.5 text-indigo-500" /><span>AI Confidence Score</span>
                                            </div>
                                            <span className="font-extrabold text-slate-900 text-sm">{currentSubmission.extractedData?.confidenceScore || 0}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${currentSubmission.extractedData?.confidenceScore || 0}%` }}
                                                transition={{ duration: 0.8 }} className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aviation Fleet Summary</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl whitespace-pre-wrap">
                                            {currentSubmission.extractedData?.summary || "No description provided."}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Comments Tab */}
                    {drawerTab === "comments" && (
                        <div className="flex flex-col flex-grow overflow-hidden">
                            <div className="flex-grow overflow-y-auto p-6 space-y-4">
                                {comments.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                                        <div className="p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-300"><MessageSquare className="w-8 h-8" /></div>
                                        <p className="font-semibold text-slate-500">No comments yet</p>
                                        <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">Start a conversation about this audit.</p>
                                    </div>
                                ) : comments.map((comment) => {
                                    const isOwn = comment.authorEmail === user?.email;
                                    const isCommentAdmin = isUserAdmin(comment.authorEmail);
                                    return (
                                        <div key={comment.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[85%] space-y-1 ${isOwn ? "items-end" : "items-start"}`}>
                                                <div className={`flex items-center space-x-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${isCommentAdmin ? "bg-slate-900 text-white" : "bg-indigo-100 text-indigo-700"}`}>
                                                        {comment.authorName?.charAt(0)?.toUpperCase() || <User2 className="w-3 h-3" />}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-500">{comment.authorName || comment.authorEmail?.split("@")[0]}</span>
                                                    {isCommentAdmin && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ADMIN</span>}
                                                </div>
                                                <div className="group relative">
                                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? "bg-slate-900 text-white rounded-br-md" : "bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-md"}`}>
                                                        {comment.text}
                                                    </div>
                                                    {(isAdmin || isOwn) && (
                                                        <button onClick={() => handleDeleteComment(comment.id)}
                                                            className={`absolute top-1 ${isOwn ? "-left-7" : "-right-7"} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200`}>
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className={`text-[10px] text-slate-400 ${isOwn ? "text-right" : "text-left"}`}>
                                                    {comment.createdAt?.seconds ? new Date(comment.createdAt.seconds * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now"}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-white sticky bottom-0">
                                <div className="flex items-center space-x-2">
                                    <input type="text" value={commentInput} onChange={(e) => setCommentInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                                        placeholder="Add a comment..." disabled={postingComment}
                                        className="flex-grow px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 placeholder:text-slate-400 disabled:opacity-50 transition-all" />
                                    <button onClick={handlePostComment} disabled={!commentInput.trim() || postingComment}
                                        className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0">
                                        {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audit Trail Tab */}
                    {drawerTab === "audit" && isAdmin && (
                        <div className="p-6 overflow-y-auto flex-1">
                            <AuditTrail submissionId={currentSubmission.id} submission={currentSubmission} />
                        </div>
                    )}

                    {drawerTab === "details" && (
                        <div className="p-6 border-t border-slate-100 sticky bottom-0 bg-white">
                            <button onClick={onClose} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg">
                                Dismiss Audit Report
                            </button>
                        </div>
                    )}
                </motion.div>
            </>
        </AnimatePresence>
    );
}
