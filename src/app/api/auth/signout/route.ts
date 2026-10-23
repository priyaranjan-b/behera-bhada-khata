import { publicRoute } from "@/server/http";
import { signOut } from "@/server/services/auth";

export const POST = publicRoute(() => signOut());
