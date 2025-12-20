/**
 * Cryptographic Integrity Utilities
 * 
 * This module provides functions for signing and verifying JSON blueprints
 * to ensure they have not been tampered with between the Design Kernel
 * and the Execution Kernel.
 * 
 * It uses the Web Crypto API for HMAC-SHA256, which provides protection
 * against timing attacks.
 */

/**
 * Generates an HMAC-SHA256 signature for a JSON blueprint.
 * The blueprint object is canonicalized to ensure a consistent signature.
 * @param blueprint The JSON object to sign.
 * @param secret The shared secret key.
 * @returns A hex-encoded signature string.
 */
export async function signBlueprint(blueprint: object, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    // Canonicalize the JSON string by sorting keys to prevent signature mismatches
    const data = encoder.encode(JSON.stringify(blueprint, Object.keys(blueprint).sort()));
    const keyData = encoder.encode(secret);

    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);

    // Convert the binary signature to a hex string for safe transit
    return Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Verifies that the received blueprint matches the provided signature.
 * @param blueprint The JSON blueprint object (including the signature property).
 * @param secret The shared secret key.
 * @returns True if the signature is valid, false otherwise.
 */
export async function verifyBlueprint(blueprint: { signature?: string, [key: string]: any }, secret: string): Promise<boolean> {
    if (!blueprint.signature) {
        return false;
    }

    const signature = blueprint.signature;
    // Create a copy of the object without the signature for verification
    const blueprintToVerify = { ...blueprint };
    delete blueprintToVerify.signature;

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(blueprintToVerify, Object.keys(blueprintToVerify).sort()));
    const keyData = encoder.encode(secret);

    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    // Convert hex signature back to an ArrayBuffer
    try {
        const sigBuffer = new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        
        // Use Web Crypto's native verify method to prevent timing attacks
        return await crypto.subtle.verify("HMAC", key, sigBuffer, data);
    } catch (e) {
        // This can happen if the signature string is not valid hex
        console.error("Error decoding signature:", e);
        return false;
    }
}
