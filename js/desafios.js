import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";

const session = await requireAuth();
if (session) montarHeader("desafios");

