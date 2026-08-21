import type { ComponentType } from "react";

import type { PublicMenuResponse } from "@/lib/menu-contract";
import type { PublicRestaurant } from "@/lib/restaurant-contract";

export type WebsiteDesignHomeProps = Readonly<{ restaurant: PublicRestaurant | null }>;
export type WebsiteDesignMenuProps = Readonly<{ site: PublicMenuResponse }>;

export type WebsiteDesignHomeRenderer = ComponentType<WebsiteDesignHomeProps>;
export type WebsiteDesignMenuRenderer = ComponentType<WebsiteDesignMenuProps>;
