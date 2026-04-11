import { redirect } from 'next/navigation';

export default async function SourcesRedirect({
  params,
}: {
  params: Promise<{ notebookId: string }>;
}) {
  const { notebookId } = await params;
  redirect(`/workspace/${notebookId}`);
}
