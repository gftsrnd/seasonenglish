import { AVATAR_CHARACTERS } from "@e4s/contracts";
import { z } from "zod";

export const avatarInput = z.object({
  acc: z.enum(["none", "leaf", "sun", "flower", "cloud", "star", "drop", "snow"]),
  color: z.enum(["ink", "brown", "olive", "taupe", "orange", "rose"]),
  bg: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  character: z.enum(AVATAR_CHARACTERS).optional()
});
