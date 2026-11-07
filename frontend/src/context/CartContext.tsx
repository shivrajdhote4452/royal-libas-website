import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { validateCoupon } from '../lib/api';
import { CouponValidateResponse } from '../types/order';

export interface CartItem {
  productId: number;
  variantId: number;
  slug: string;
  name: string;
  size: string;
  colour?: string | null;
  sellingPrice: number;
  image: string | null;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  removeFromCart: (variantId: number) => void;
  removePurchasedItems: (purchased: { variantId: number; quantity: number }[]) => void;
  clearCart: () => void;
  appliedCouponCode: string | null;
  appliedCoupon: CouponValidateResponse | null;
  couponDiscount: number;
  couponError: string | null;
  isValidatingCoupon: boolean;
  applyCoupon: (code: string) => Promise<{ success: boolean; message?: string }>;
  removeCoupon: () => void;
  revalidateCoupon: (customSubtotal?: number) => Promise<void>;
}

const CartContext = createContext<CartContextType>({
  items: [],
  totalItems: 0,
  subtotal: 0,
  isDrawerOpen: false,
  setIsDrawerOpen: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  removePurchasedItems: () => {},
  clearCart: () => {},
  appliedCouponCode: null,
  appliedCoupon: null,
  couponDiscount: 0,
  couponError: null,
  isValidatingCoupon: false,
  applyCoupon: async () => ({ success: false }),
  removeCoupon: () => {},
  revalidateCoupon: async () => {},
});

const CART_STORAGE_KEY = 'royal_libas_cart_v1';
const COUPON_STORAGE_KEY = 'royal_libas_applied_coupon_v1';

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(COUPON_STORAGE_KEY);
      return saved ? saved.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidateResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to persist cart:', e);
    }
  }, [items]);

  // Sync state on cross-tab storage changes or external custom events
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          setItems(parsed);
        }
        const savedCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
        setAppliedCouponCode(savedCoupon ? savedCoupon.trim().toUpperCase() : null);
      } catch {}
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY || e.key === COUPON_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('royal_libas_cart_update', syncFromStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('royal_libas_cart_update', syncFromStorage);
    };
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);

  const couponDiscount = appliedCoupon?.valid ? Number(appliedCoupon.discount) : 0;

  const removeCoupon = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedCoupon(null);
    setCouponError(null);
    try {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    } catch {}
  }, []);

  const revalidateCoupon = useCallback(async (currentSubtotal?: number) => {
    const subtotalToUse = currentSubtotal !== undefined ? currentSubtotal : subtotal;
    if (!appliedCouponCode) {
      setAppliedCoupon(null);
      return;
    }

    if (items.length === 0 || subtotalToUse <= 0) {
      setAppliedCoupon(null);
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const res = await validateCoupon(appliedCouponCode, subtotalToUse);
      if (res.valid) {
        setAppliedCoupon({ ...res, discount: Number(res.discount) });
        setCouponError(null);
      } else {
        // Coupon became ineligible, expired, or deactivated
        setAppliedCoupon(null);
        setAppliedCouponCode(null);
        setCouponError(res.message || 'Coupon is no longer eligible for this cart.');
        try {
          localStorage.removeItem(COUPON_STORAGE_KEY);
        } catch {}
      }
    } catch {
      // In case of transient validation error, keep previous validation state
    } finally {
      setIsValidatingCoupon(false);
    }
  }, [appliedCouponCode, subtotal, items.length]);

  const applyCoupon = async (rawCode: string): Promise<{ success: boolean; message?: string }> => {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError('Please enter a coupon code.');
      return { success: false, message: 'Please enter a coupon code.' };
    }

    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      const res = await validateCoupon(cleanCode, subtotal);
      if (res.valid) {
        setAppliedCouponCode(cleanCode);
        setAppliedCoupon({ ...res, discount: Number(res.discount) });
        setCouponError(null);
        try {
          localStorage.setItem(COUPON_STORAGE_KEY, cleanCode);
        } catch {}
        return { success: true };
      } else {
        const errMsg = res.message || 'Invalid or ineligible coupon code.';
        setCouponError(errMsg);
        setAppliedCouponCode(null);
        setAppliedCoupon(null);
        try {
          localStorage.removeItem(COUPON_STORAGE_KEY);
        } catch {}
        return { success: false, message: errMsg };
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to validate coupon.';
      setCouponError(errMsg);
      setAppliedCouponCode(null);
      setAppliedCoupon(null);
      try {
        localStorage.removeItem(COUPON_STORAGE_KEY);
      } catch {}
      return { success: false, message: errMsg };
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  // Automatically revalidate coupon when cart subtotal or item count changes
  useEffect(() => {
    if (appliedCouponCode && subtotal > 0 && items.length > 0) {
      revalidateCoupon(subtotal);
    } else if (items.length === 0 || subtotal <= 0) {
      if (appliedCoupon) setAppliedCoupon(null);
    }
  }, [subtotal, items.length, appliedCouponCode, revalidateCoupon]);

  const addToCart = (newItem: Omit<CartItem, 'quantity'>, quantity: number = 1) => {
    setItems((prevItems) => {
      const existingIndex = prevItems.findIndex((i) => i.variantId === newItem.variantId);
      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex].quantity += quantity;
        return updated;
      }
      return [...prevItems, { ...newItem, quantity }];
    });
    setIsDrawerOpen(true);
  };

  const updateQuantity = (variantId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.variantId === variantId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (variantId: number) => {
    setItems((prevItems) => prevItems.filter((i) => i.variantId !== variantId));
  };

  const removePurchasedItems = (purchased: { variantId: number; quantity: number }[]) => {
    if (!purchased || purchased.length === 0) return;
    setItems((prevItems) => {
      const remaining: CartItem[] = [];
      const purchasedMap = new Map<number, number>();
      purchased.forEach((p) => {
        purchasedMap.set(p.variantId, (purchasedMap.get(p.variantId) || 0) + p.quantity);
      });

      for (const item of prevItems) {
        const boughtQty = purchasedMap.get(item.variantId) || 0;
        if (boughtQty === 0) {
          remaining.push(item);
        } else if (item.quantity > boughtQty) {
          remaining.push({ ...item, quantity: item.quantity - boughtQty });
          purchasedMap.set(item.variantId, 0);
        } else {
          purchasedMap.set(item.variantId, boughtQty - item.quantity);
        }
      }
      return remaining;
    });
  };

  const clearCart = () => {
    setItems([]);
    removeCoupon();
  };

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        subtotal,
        isDrawerOpen,
        setIsDrawerOpen,
        openDrawer,
        closeDrawer,
        addToCart,
        updateQuantity,
        removeFromCart,
        removePurchasedItems,
        clearCart,
        appliedCouponCode,
        appliedCoupon,
        couponDiscount,
        couponError,
        isValidatingCoupon,
        applyCoupon,
        removeCoupon,
        revalidateCoupon,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
