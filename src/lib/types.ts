export type Status = "owned" | "wanted";

export type Comic = {
  id: string;
  user_id: string;
  status: Status;
  cv_issue_id: number | null;
  cv_volume_id: number | null;
  series: string;
  volume_year: string | null;
  issue_number: string | null;
  title: string | null;
  publisher: string | null;
  cover_date: string | null;
  variant: string | null;
  characters: string[];
  creators: string[];
  cover_path: string | null;
  grade: string | null;
  slabbed: boolean;
  price_paid: number | null;
  is_read: boolean;
  location: string | null;
  tags: string[];
  notes: string | null;
  /** Characters whose first appearance is this issue. */
  first_appearances: string[];
  story_arcs: StoryArcRef[];
  /** When first appearances and story arcs were looked up on Comic Vine (null = not yet). */
  extras_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Fields a person can type in; everything else is set by the app or database. */
export type ComicInput = Partial<Omit<Comic, "id" | "user_id" | "created_at" | "updated_at">>;

export type CvVolume = {
  id: number;
  name: string;
  start_year: string | null;
  publisher: string | null;
  count_of_issues: number | null;
  image: string | null;
};

export type CvIssue = {
  id: number;
  name: string | null;
  issue_number: string | null;
  cover_date: string | null;
  image: string | null;
  volume_id: number | null;
  volume_name: string | null;
};

export type StoryArcRef = { id: number; name: string };

export type CvCharacter = {
  id: number;
  name: string;
  real_name: string | null;
  publisher: string | null;
  image: string | null;
  appearances: number | null;
  first_issue: { id: number; name: string | null; issue_number: string | null } | null;
};

export type CvStoryArc = {
  id: number;
  name: string;
  deck: string | null;
  publisher: string | null;
  image: string | null;
  /** Issue ids in Comic Vine's reading order. */
  issueIds: number[];
};
