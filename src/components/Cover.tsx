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

type CardComic = Pick<Comic, "id" | "series" | "volume_year" | "issue_number" | "title" | "cover_date" | "cover_path" | "status">;

/**
 * One comic in a grid. By default it links to the comic's page.
 * `href={null}` shows it without a link (shared pages); `onToggle` makes it a tick-box for selecting.
 */
export function ComicCard({ comic, showSeries = true, href, selected, onToggle }: {
  comic: CardComic;
  showSeries?: boolean;
  href?: string | null;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const name = seriesName(comic);
  const sub = [showSeries ? comic.title : null, comic.cover_date?.slice(0, 4) || null].filter(Boolean).join(" · ");
  const body = (
    <>
      <CoverImage src={coverUrl(comic.cover_path)} title={name} issue={comic.issue_number} />
      {onToggle ? <span className="tick" aria-hidden="true">{selected ? "✓" : ""}</span> : null}
      <span className="t">{showSeries ? name : comic.title || `${name} ${issueLabel(comic.issue_number)}`}</span>
      {sub || comic.status === "wanted" ? (
        <span className="s">
          {comic.status === "wanted" ? <b className="pill want">Want</b> : null}
          {sub}
        </span>
      ) : null}
    </>
  );

  if (onToggle) {
    return (
      <button type="button" className={`cover selectable ${selected ? "selected" : ""}`} aria-pressed={!!selected} onClick={onToggle}>
        {body}
      </button>
    );
  }
  const link = href === undefined ? `/comic?id=${comic.id}` : href;
  return link ? <Link href={link} className="cover">{body}</Link> : <div className="cover">{body}</div>;
}
