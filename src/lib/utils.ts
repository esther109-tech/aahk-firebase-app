/**
 * Classifies an email address into its corresponding Airline Tenant Name.
 * If the email belongs to an administrator, returns "AAHK Admin".
 * Otherwise, deduces the airline name from the domain.
 */
export function getAirlineFromEmail(email: string | null | undefined): string {
    if (!email) return "Other";
    const lowerEmail = email.toLowerCase().trim();
    
    // Check for administrator domains first
    if (
        lowerEmail.endsWith("@aahk.com") || 
        lowerEmail.endsWith("@microfusion.cloud") || 
        lowerEmail === "esther.shih@microfusion.cloud"
    ) {
        return "AAHK Admin";
    }
    
    if (lowerEmail.includes("cathay")) {
        return "Cathay Pacific";
    }
    if (lowerEmail.includes("singapore")) {
        return "Singapore Airlines";
    }
    if (lowerEmail.includes("emirates")) {
        return "Emirates";
    }
    if (lowerEmail.includes("jal") || lowerEmail.includes("japan")) {
        return "Japan Airlines";
    }
    if (lowerEmail.includes("qantas")) {
        return "Qantas";
    }
    if (lowerEmail.includes("airchina")) {
        return "Air China";
    }
    if (lowerEmail.includes("eva")) {
        return "EVA Air";
    }
    if (lowerEmail.includes("allnippon") || lowerEmail.includes("ana.")) {
        return "All Nippon Airways";
    }
    
    // Fallback: parse domain and capitalize
    try {
        const domainPart = lowerEmail.split("@")[1];
        if (domainPart) {
            const domainName = domainPart.split(".")[0];
            if (domainName) {
                return domainName.charAt(0).toUpperCase() + domainName.slice(1);
            }
        }
    } catch (e) {
        console.error("Error parsing domain from email:", e);
    }
    
    return "Other";
}

export const AIRLINE_OPTIONS = [
  "Cathay Pacific",
  "Singapore Airlines",
  "Emirates",
  "Japan Airlines",
  "Qantas",
  "Air China",
  "EVA Air",
  "All Nippon Airways",
];

/**
 * Determines whether a user email has administrative access.
 */
export function isUserAdmin(email: string | null | undefined): boolean {
    if (!email) return false;
    const lowerEmail = email.toLowerCase().trim();
    return (
        lowerEmail.endsWith("@aahk.com") ||
        lowerEmail.endsWith("@microfusion.cloud") ||
        lowerEmail === "esther.shih@microfusion.cloud"
    );
}
