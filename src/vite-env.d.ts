/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SYSTEM_MESSAGE?: string;
  readonly VITE_PROJECT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
