export type UserRole = 'ADMIN' | 'OWNER' | 'RENTER';
export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'COMPLETED';
export type PaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'BANK_TRANSFER';
export type VehicleCategory =
  | 'ECONOMY'
  | 'HATCH'
  | 'SEDAN'
  | 'SUV'
  | 'PICKUP'
  | 'VAN'
  | 'LUXURY';
export type FuelType =
  | 'GASOLINE'
  | 'ETHANOL'
  | 'FLEX'
  | 'DIESEL'
  | 'ELECTRIC'
  | 'HYBRID';
export type TransmissionType = 'MANUAL' | 'AUTOMATIC' | 'CVT';
export type VerificationStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface VehicleImage {
  id: string;
  url: string;
  alt?: string | null;
  position: number;
}

export interface Profile {
  id?: string;
  fullName: string;
  phone: string;
  city: string;
  state: string;
  bio?: string | null;
  avatarUrl?: string | null;
  documentNumber?: string | null;
  driverLicenseNumber?: string | null;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  profile: Profile | null;
}

export interface PublicUserProfile {
  id: string;
  role: UserRole;
  memberSince: string;
  fullName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  ratingAverage: number;
  reviewsCount: number;
  activeListingsCount: number;
  verification: {
    documentStatus: VerificationStatus;
    driverLicenseStatus: VerificationStatus;
    profileStatus: VerificationStatus;
  };
  vehicles: VehicleCardItem[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface VehicleCardItem {
  id: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  city: string;
  state: string;
  category: string;
  seats: number;
  transmission: string;
  fuelType: string;
  dailyRate: number;
  ratingAverage: number;
  reviewsCount: number;
  coverImage: string | null;
  owner?: {
    id: string;
    fullName: string | null;
    city: string | null;
    state: string | null;
  };
}

export interface OwnerVehicleItem {
  id: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  city: string;
  state: string;
  category: VehicleCategory;
  transmission: TransmissionType;
  fuelType: FuelType;
  seats: number;
  dailyRate: number;
  description: string;
  addressLine?: string | null;
  isActive: boolean;
  isPublished: boolean;
  ratingAverage: number;
  reviewsCount: number;
  coverImage: string | null;
  images: VehicleImage[];
}

export interface VehicleDetail extends VehicleCardItem {
  description: string;
  addressLine?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPublished: boolean;
  images: VehicleImage[];
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    author: {
      id: string;
      fullName: string | null;
    };
  }>;
}

export interface VehicleSearchResponse {
  items: VehicleCardItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    hasNextPage: boolean;
  };
}

export interface CreateVehiclePayload {
  title: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  city: string;
  state: string;
  category: VehicleCategory;
  transmission: TransmissionType;
  fuelType: FuelType;
  seats: number;
  dailyRate: number;
  description: string;
  addressLine?: string;
  isPublished?: boolean;
}

export type UpdateVehiclePayload = Partial<CreateVehiclePayload>;

export interface Booking {
  id: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  totalDays: number;
  dailyRate: number;
  subtotal: number;
  platformFee: number;
  totalAmount: number;
  notes?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  vehicle: {
    id: string;
    title: string;
    city: string;
    state: string;
    dailyRate: number;
    image: string | null;
  };
  renter: {
    id: string;
    email: string;
    fullName: string | null;
  };
  owner: {
    id: string;
    email: string;
    fullName: string | null;
  };
  payment?: {
    id: string;
    status: string;
    method: PaymentMethod;
    amount: number;
    ownerAmount: number;
    platformFee: number;
    transactionId: string;
  } | null;
  statusHistory: Array<{
    id: string;
    fromStatus?: BookingStatus | null;
    toStatus: BookingStatus;
    reason?: string | null;
    changedAt: string;
  }>;
  review?: unknown;
}

export interface VehicleAvailabilityResponse {
  vehicleId: string;
  weeklyAvailability: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  blockedDates: Array<{
    id: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
  }>;
  approvedBookings: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: BookingStatus;
  }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface ChatConversationItem {
  id: string;
  vehicle: {
    id: string;
    title: string;
    coverImage: string | null;
    city: string;
    state: string;
    dailyRate: number;
  };
  otherParticipant: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl?: string | null;
    isOnline: boolean;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
  lastMessageAt?: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl?: string | null;
  };
}
