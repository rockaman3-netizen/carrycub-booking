export default function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
      {text}
    </p>
  );
}
