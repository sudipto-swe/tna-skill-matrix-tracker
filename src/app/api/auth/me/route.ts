import { NextRequest } from "next/server";
import { handleApi, ApiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return handleApi(req, { public: true }, async () => {
    const session = await getSessionUser(req);
    if (!session) throw new ApiError(401, "Not authenticated");
    return { user: session };
  });
}
