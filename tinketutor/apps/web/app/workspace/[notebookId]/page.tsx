'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Default workspace route — redirects to the canvas tab.
 * Sources are managed via the left sidebar; no dedicated sources page needed.
 */
export default function WorkspaceDefaultPage() {
  const router = useRouter();
  const params = useParams();
  const notebookId = params.notebookId as string;

  useEffect(() => {
    router.replace(`/workspace/${notebookId}/canvas`);
  }, [notebookId, router]);

  return null;
}
