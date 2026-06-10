import raw from "../../../../config/contentPillars.json";

export interface ContentPillar {
  slug: string;
  name: string;
  color: string;
  icon: string;
}

const CONTENT_PILLARS: ContentPillar[] = raw as ContentPillar[];
export default CONTENT_PILLARS;
