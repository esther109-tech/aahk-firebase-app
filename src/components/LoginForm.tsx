"use client";

import React, { useState } from "react";
import { auth } from "@/lib/firebase";
import {
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail
} from "firebase/auth";
import { LogIn, LogOut, Loader2, AlertCircle, User as UserIcon, UserPlus, Mail, CheckCircle2, ChevronLeft, KeyRound } from "lucide-react";

export default function LoginForm({ userEmail }: { userEmail: string | null }) {
    const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verificationSent, setVerificationSent] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            console.error("Login error:", err);
            setError("Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (userCredential.user) {
                try {
                    await sendEmailVerification(userCredential.user);
                    setVerificationSent(true);
                } catch (vErr) {
                    console.error("Verification email failed:", vErr);
                    // Account created, but email failed. Let's just treat as success but show warning.
                    setVerificationSent(true);
                }
            }
        } catch (err: any) {
            console.error("Registration error:", err);
            if (err.code === 'auth/email-already-in-use') {
                setError("This email is already registered.");
            } else if (err.code === 'auth/weak-password') {
                setError("Password should be at least 6 characters.");
            } else {
                setError("Failed to create account.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await sendPasswordResetEmail(auth, email);
            setResetEmailSent(true);
        } catch (err: any) {
            console.error("Reset email error:", err);
            if (err.code === 'auth/user-not-found') {
                setError("No account found with this email.");
            } else {
                setError("Failed to send reset email. Please check the address.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (err: any) {
            console.error("Google Login error:", err);
            setError("Google sign-in failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setVerificationSent(false);
            setResetEmailSent(false);
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    if (userEmail) {
        return (
            <div className="flex items-center space-x-4 bg-slate-50 p-2 px-4 rounded-full border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-center space-x-2">
                    <UserIcon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">{userEmail}</span>
                </div>
                <button
                    onClick={handleLogout}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center space-x-1 transition-colors"
                >
                    <LogOut className="w-3 h-3" />
                    <span>Logout</span>
                </button>
            </div>
        );
    }

    if (verificationSent) {
        return (
            <div className="w-full max-w-md mx-auto p-8 rounded-3xl bg-white border border-slate-200 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                    <Mail className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900">Account Created!</h2>
                    <p className="text-slate-500">Verification email sent to <span className="font-semibold text-slate-900">{email}</span>.</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed italic">
                    Please verify your email address to complete your registration.
                </div>
                <button
                    onClick={() => { setVerificationSent(false); setMode("login"); }}
                    className="text-slate-400 hover:text-slate-900 text-sm font-medium transition-colors flex items-center justify-center mx-auto space-x-1"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Sign In</span>
                </button>
            </div>
        );
    }

    if (resetEmailSent) {
        return (
            <div className="w-full max-w-md mx-auto p-8 rounded-3xl bg-white border border-slate-200 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto border border-indigo-100">
                    <KeyRound className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900">Check Your Email</h2>
                    <p className="text-slate-500">Reset instructions sent to <span className="font-semibold text-slate-900">{email}</span>.</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed">
                    Once you've reset your password, return here to sign in with your new credentials.
                </div>
                <button
                    onClick={() => { setResetEmailSent(false); setMode("login"); }}
                    className="text-slate-400 hover:text-slate-900 text-sm font-medium transition-colors flex items-center justify-center mx-auto space-x-1"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Sign In</span>
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md mx-auto p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-900/10 to-transparent"></div>

            <div className="space-y-8">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {mode === "login" ? "Sign In" : mode === "register" ? "Register" : "Reset Password"}
                    </h2>
                    <p className="text-slate-500 text-sm">
                        {mode === "login"
                            ? "Access your skygate airline dashboard"
                            : mode === "register"
                                ? "Create an account to start submitting updates"
                                : "We'll send a reset link to your inbox"}
                    </p>
                </div>

                <form onSubmit={
                    mode === "login" ? handleLogin :
                        mode === "register" ? handleRegister :
                            handleForgotPassword
                } className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all bg-slate-50/50"
                                placeholder="name@company.com"
                            />
                        </div>

                        {mode !== "forgot" && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Password</label>
                                    {mode === "login" && (
                                        <button
                                            type="button"
                                            onClick={() => setMode("forgot")}
                                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            Forgot?
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all bg-slate-50/50"
                                    placeholder="••••••••"
                                />
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center space-x-3 text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in slide-in-from-top-1">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-semibold">{error}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 shadow-xl shadow-slate-900/20 active:scale-[0.98] disabled:bg-slate-300"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : mode === "login" ? (
                                <LogIn className="w-5 h-5" />
                            ) : mode === "register" ? (
                                <UserPlus className="w-5 h-5" />
                            ) : (
                                <Mail className="w-5 h-5" />
                            )}
                            <span>{loading ? "Processing..." : mode === "login" ? "Sign In" : mode === "register" ? "Register Now" : "Send Reset Link"}</span>
                        </button>

                        {mode !== "forgot" && (
                            <>
                                <div className="relative py-2">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-slate-100"></span>
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-white px-4 text-slate-400 font-medium">Or security verify via</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGoogleLogin}
                                    disabled={loading}
                                    className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center space-x-3 shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            fill="#4285F4"
                                        />
                                        <path
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            fill="#34A853"
                                        />
                                        <path
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                                            fill="#FBBC05"
                                        />
                                        <path
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            fill="#EA4335"
                                        />
                                    </svg>
                                    <span>Google Account</span>
                                </button>
                            </>
                        )}
                    </div>

                    <div className="text-center pt-2 flex flex-col space-y-3">
                        <button
                            type="button"
                            onClick={() => setMode(mode === "login" ? "register" : "login")}
                            className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors underline underline-offset-4"
                        >
                            {mode === "login" ? "Don't have an account? Register" : "Already have an account? Sign In"}
                        </button>

                        {mode === "forgot" && (
                            <button
                                type="button"
                                onClick={() => setMode("login")}
                                className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center space-x-1"
                            >
                                <ChevronLeft className="w-3 h-3" />
                                <span>Back to Sign In</span>
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
