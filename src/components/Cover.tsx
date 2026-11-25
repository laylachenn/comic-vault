import Link from "next/link";
import type { Comic } from "@/lib/types";
import { coverUrl } from "@/lib/supabase";
import { issueLabel, seriesName } from "@/lib/comics";

/** A cover image, or a printed placeholder when there's no picture. */
export function CoverImage({ src, title, issue, className }: { src: string | null; title: string; issue?: string | null; className?: string }) {
  return (
    <div className={`img ${className ?? ""}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Cover of ${title} ${issueLabel(issue)}`.trim()} loading="lazy" />
      ) : (
        <div className="no-cover"><span>{title}</span></div>
      )}
      {issueLabel(issue) ? <span className="iss">{issueLabel(issue)}</span> : null}
    </div>
  );
}

export function ComicCard({ comic, showSeries = true }: { comic: Comic; showSeries?: boolean }) {
  const name = seriesName(comic);
  const sub = [showSeries ? comic.title : null, comic.cover_date?.slice(0, 4) || null].filter(Boolean).join(" · ");
  return (
    <Link href={`/comic?id=${comic.id}`} className="cover">
      <CoverImage src={coverUrl(comic.cover_path)} title={name} issue={comic.issue_number} />
      <span className="t">{showSeries ? name : comic.title || `${name} ${issueLabel(comic.issue_number)}`}</span>
      {sub || comic.status === "wanted" ? (
        <span className="s">
          {comic.status === "wanted" ? <b className="pill want">Want</b> : null}
          {sub}
        </span>
      ) : null}
    </Link>
  );
}
