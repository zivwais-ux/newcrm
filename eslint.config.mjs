import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    // The service-role client bypasses RLS; it may only be used by offline scripts.
    files: ["app/**", "components/**", "lib/**"],
    ignores: ["lib/supabase/admin.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/lib/supabase/admin", message: "Service-role client is for scripts only." }] },
      ],
    },
  },
];

export default eslintConfig;
