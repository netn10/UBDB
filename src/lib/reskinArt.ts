import { UbCard } from "@/types/types";
import { getImageSrc } from "@/lib/api";

export interface TileArt {
  /** Ready to use as an <img src>; already through getImageSrc. "" if none. */
  src: string;
  alt: string;
  isReskin: boolean;
}

/** Pick the image a browse tile should show for one face of a card. With
 *  `prefer` on we use that face's top reskin when it exists, otherwise the
 *  official printing. Faces resolve independently, so a DFC whose back has a
 *  reskin and whose front does not shows original front art beside reskin back
 *  art — better than hiding a reskin that exists. */
export function tileArt(card: UbCard, prefer: boolean, back = false): TileArt {
  const reskin = back ? card.top_reskin_back : card.top_reskin;
  if (prefer && reskin?.image_url) {
    return { src: getImageSrc(reskin.image_url), alt: reskin.reskin_name, isReskin: true };
  }
  const official = back
    ? card.prints[0]?.image_back_normal
    : (card.prints[0]?.image_normal ?? card.art_uri);
  return {
    src: official ? getImageSrc(official) : "",
    alt: back ? `${card.faces[1]?.name ?? card.name} (back)` : card.name,
    isReskin: false,
  };
}
