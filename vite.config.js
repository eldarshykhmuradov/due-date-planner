import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base: "./" keeps asset paths relative so the build works under any subpath
// (e.g. GitHub Pages project sites or GitLab Pages).
export default defineConfig({
    plugins: [react()],
    base: "./",
});
