import { NextResponse } from 'next/server';

function isGoogleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_REDIRECT_URI?.trim(),
  );
}

function isGithubEnabled(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
    process.env.GITHUB_CLIENT_SECRET?.trim() &&
    process.env.GITHUB_CALLBACK_URL?.trim(),
  );
}

export async function GET() {
  return NextResponse.json({
    google: isGoogleEnabled(),
    github: isGithubEnabled(),
  });
}
