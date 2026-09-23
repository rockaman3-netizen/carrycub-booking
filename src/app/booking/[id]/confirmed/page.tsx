import BookingConfirmation from "@/components/BookingConfirmation";

export default async function BookingConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingConfirmation id={id} />;
}
