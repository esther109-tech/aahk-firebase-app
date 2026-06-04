/**
 * Utility library for loading Google API Client (GAPI) and Google Identity Services (GIS).
 * Handles authentication scope requests and orchestrates Google Picker views.
 */

export function loadGoogleScripts(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            resolve();
            return;
        }

        // Check if both are already loaded
        const gapiLoaded = !!(window as any).gapi;
        const gisLoaded = !!(window as any).google?.accounts?.oauth2;

        if (gapiLoaded && gisLoaded) {
            resolve();
            return;
        }

        let loadedCount = 0;
        const checkResolve = () => {
            loadedCount++;
            if (loadedCount === 2) {
                resolve();
            }
        };

        const loadScript = (src: string, onLoad: () => void) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                onLoad();
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = onLoad;
            script.onerror = () => reject(new Error(`Failed to load Google SDK script: ${src}`));
            document.head.appendChild(script);
        };

        loadScript("https://apis.google.com/js/api.js", () => {
            (window as any).gapi.load("client:picker", () => {
                checkResolve();
            });
        });

        loadScript("https://accounts.google.com/gsi/client", () => {
            checkResolve();
        });
    });
}

export function requestGoogleAccessToken(clientId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("Cannot request OAuth tokens server-side."));
            return;
        }

        const google = (window as any).google;
        if (!google?.accounts?.oauth2) {
            reject(new Error("Google Identity Services script not loaded."));
            return;
        }

        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: "https://www.googleapis.com/auth/drive.readonly",
                callback: (response: any) => {
                    if (response.error !== undefined) {
                        reject(response);
                        return;
                    }
                    if (response.access_token) {
                        resolve(response.access_token);
                    } else {
                        reject(new Error("No access token returned from consent popup."));
                    }
                },
            });

            client.requestAccessToken({ prompt: "consent" });
        } catch (err) {
            reject(err);
        }
    });
}

export interface PickerFile {
    id: string;
    name: string;
    mimeType: string;
}

export interface PickerConfig {
    apiKey: string;
    accessToken: string;
    onSelect: (file: PickerFile) => void;
    onCancel?: () => void;
}

export function openGooglePicker({ apiKey, accessToken, onSelect, onCancel }: PickerConfig): void {
    const google = (window as any).google;
    const gapi = (window as any).gapi;

    if (!google?.picker || !gapi) {
        console.error("Google Picker or GAPI not loaded inside client.");
        return;
    }

    // Configure standard docs and images view
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    
    // Restrict to supported aviation compliance report types
    const allowedMimeTypes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "image/png",
        "image/jpeg",
        "image/jpg"
    ].join(",");
    
    view.setMimeTypes(allowedMimeTypes);

    try {
        const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(accessToken)
            .setDeveloperKey(apiKey)
            .setCallback((data: any) => {
                if (data.action === google.picker.Action.PICKED) {
                    const doc = data.docs[0];
                    if (doc) {
                        onSelect({
                            id: doc.id,
                            name: doc.name,
                            mimeType: doc.mimeType
                        });
                    }
                } else if (data.action === google.picker.Action.CANCEL) {
                    if (onCancel) onCancel();
                }
            })
            .build();

        picker.setVisible(true);
    } catch (err) {
        console.error("Error constructing Google Picker modal:", err);
    }
}
