/**
 * One product-card width for every row on the storefront.
 *
 * Swipeable rows and grids used to size cards independently (44% here,
 * 176px there, 208px or a grid column on desktop), so scrolling the home
 * page went thin–wide–thin. These match the grid columns exactly: two and
 * a peek on a phone, three across on a tablet, four on desktop — with the
 * row gap below (gap-3, md:gap-4) taken out of the calculation.
 */
export const RAIL_ROW = "rail-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:gap-4";
export const RAIL_CARD =
  "flex w-[44%] shrink-0 snap-start md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]";

/**
 * The same width for a row inside a padded panel (Flash Deals: p-4, p-6
 * from sm). Percentages there measure the panel's inside, so the padding
 * is added back to land on the page-row width above.
 */
export const PANEL_RAIL_CARD =
  "flex w-[calc((100%+2rem)*0.44)] shrink-0 snap-start md:w-[calc((100%+1rem)/3)] lg:w-1/4";
