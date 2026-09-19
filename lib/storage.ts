import crypto from 'node:crypto';

/**
 * Payment proofs never live in the repo or on the Railway filesystem (both are
 * ephemeral). Two backends:
 *   S3  — set S3_BUCKET + credentials. Objects are private; the dashboard reads
 *         them through a short-lived presigned URL.
 *   DB  — default. Bytes go in Postgres and are served only through the
 *         authenticated /api/admin/proof/[id] route.
 * Either way the object key is random, so URLs are not enumerable.
 */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function s3Enabled(): boolean {
  return Boolean(
    process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
  );
}

function client() {
  // Imported lazily so deployments without S3 never load the SDK.
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export function proofKey(reference: string, filename: string): string {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `proofs/${reference}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

export async function putProof(key: string, body: Buffer, contentType: string): Promise<void> {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function signedProofUrl(key: string, seconds = 900): Promise<string> {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    { expiresIn: seconds },
  );
}
