export type RequestStatus = "pending" | "accepted" | "rejected" | "confirmed" | "declined";

export const REQUEST_STATUSES: RequestStatus[] = ["pending", "accepted", "rejected", "confirmed", "declined"];

export function calcOrderTotal(produceCost: number, deliveryCharges: number): number {
  return produceCost + deliveryCharges;
}

export function calcFarmerMargin(pricePerQuintal: number, produceCostPerQuintal: number, quantity: number, deliveryCharges: number): number {
  return (pricePerQuintal - produceCostPerQuintal) * quantity - deliveryCharges;
}

export function statusLabel(s: RequestStatus): string {
  switch (s) {
    case "pending":
      return "Waiting for farmer";
    case "accepted":
      return "Farmer accepted — confirm to book";
    case "rejected":
      return "Rejected by farmer";
    case "confirmed":
      return "Confirmed";
    case "declined":
      return "Declined by you";
  }
}

export type Listing = {
  id: string;
  farmer_id: string;
  crop: string;
  variety: string | null;
  farm_name: string;
  location: string;
  price_per_quintal: number;
  quantity_quintals: number;
  min_order_quintals: number;
  created_at: string;
};

export type StockNotification = {
  id: string;
  listing_id: string;
  crop: string;
  location: string;
  remaining_quintals: number;
  created_at: string;
};

export type DeliveryRequest = {
  id: string;
  listing_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_address: string;
  quantity_quintals: number;
  produce_cost: number;
  delivery_charges: number | null;
  total_price: number | null;
  status: RequestStatus;
  created_at: string;
};

export type BuyerRequestView = Pick<
  DeliveryRequest,
  "id" | "listing_id" | "quantity_quintals" | "produce_cost" | "delivery_charges" | "total_price" | "status" | "created_at"
> & { crop: string; location: string; farm_name: string };
