import Link from "next/link"
import { areaWorkspace, areas, type Area } from "@/lib/research"

export function ResearchAreas({ selected, workspace }: { selected?: Area; workspace?: "catalog" | "pages" }) {
  return <nav className="ws-research-areas" aria-label="Области исследований">
    {Object.entries(areas).map(([key, info]) => {
      const area = key as Area
      return <Link key={area} prefetch={false} href={workspace ? areaWorkspace(area, workspace) : "/research/" + area}
        aria-current={area === selected ? "page" : undefined}>{info.label}</Link>
    })}
  </nav>
}
