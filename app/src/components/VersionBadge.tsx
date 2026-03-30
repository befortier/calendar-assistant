import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface VersionInfo {
  sha: string;
  branch: string;
}

export default function VersionBadge() {
  const [version, setVersion] = useState<VersionInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/version`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: VersionInfo) => setVersion(data))
      .catch(() => {/* ignore – badge just won't show */});
    return () => controller.abort();
  }, []);

  if (!version || version.sha === 'local') return null;

  const short = version.sha.slice(0, 7);

  return (
    <span
      className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-400"
      title={`${version.branch} @ ${version.sha}`}
    >
      {short}
    </span>
  );
}
