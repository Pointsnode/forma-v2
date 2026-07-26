import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next 16 ships native flat configs — spread them directly (no FlatCompat).
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "scripts/**", "supabase/**"] },
];

export default eslintConfig;
