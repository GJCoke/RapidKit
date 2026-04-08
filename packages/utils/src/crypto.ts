import CryptoJS from "crypto-js"

export class Crypto<T extends object> {
  /** Secret */
  secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  encrypt(data: T): string {
    const dataString = JSON.stringify(data)
    const encrypted = CryptoJS.AES.encrypt(dataString, this.secret)
    return encrypted.toString()
  }

  decrypt(encrypted: string) {
    const decrypted = CryptoJS.AES.decrypt(encrypted, this.secret)
    const dataString = decrypted.toString(CryptoJS.enc.Utf8)
    try {
      return JSON.parse(dataString) as T
    } catch {
      // avoid parse error
      return null
    }
  }
}

export async function rsaEncrypt(publicKeyPem: string, plaintext: string): Promise<string> {
  const pemBody = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "")
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const publicKey = await crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  )

  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt("RSA-OAEP", publicKey, encoded)

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}
