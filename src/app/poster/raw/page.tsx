import { RawPoster } from "./RawPoster";

export default async function RawPosterPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  return <RawPoster encoded={sp.p} />;
}
