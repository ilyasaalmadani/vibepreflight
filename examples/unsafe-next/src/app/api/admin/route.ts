const databaseUrl = process.env.DATABASE_URL;

export async function GET() { return Response.json({ ok: Boolean(databaseUrl) }); }
