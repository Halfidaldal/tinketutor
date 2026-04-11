/**
 * Sources Tab — separate sources directory page
 * Redirects to the main workspace page which is the Sources tab.
 */

import { redirect } from 'next/navigation';

export default function SourcesRedirect({
  params,
}: {
  params: Promise<{ notebookId: string }>;
}) {
  // Sources is the default tab — same as the workspace root page
  return redirect(`/workspace/${params}`);
}
