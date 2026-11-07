import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { validateCoupon, roundCurrency } from '../lib/api';
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

export type CouponStatus = 'IDLE' | 'VALIDATING' | 'RESOLVED' | 'ERROR' | 'REJECTED';

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
  couponStatus: CouponStatus;
  isValidatingCoupon: boolean;
  applyCoupon: (code: string) => Promise<{ success: boolean; message?: string }>;
  removeCoupon: () => void;
  revalidateCoupon: (customSubtotal?: number) => Promise<CouponValidateResponse | null>;
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
  couponStatus: 'IDLE',
  isValidatingCoupon: false,
  applyCoupon: async () => ({ success: false }),
  removeCoupon: () => {},
  revalidateCoupon: async () => null,
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

  // Track validation status explicitly to block premature order submission and reflect pending/error states
  const [couponStatus, setCouponStatus] = useState<CouponStatus>(() => {
    try {
      const saved = localStorage.getItem(COUPON_STORAGE_KEY);
      return saved && saved.trim() ? 'VALIDATING' : 'IDLE';
    } catch {
      return 'IDLE';
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidateResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(COUPON_STORAGE_KEY);
      return Boolean(saved && saved.trim());
    } catch {
      return false;
    }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Request sequencing and AbortController to discard stale asynchronous responses
  const validationSeqRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    const handleStorage = (e: StorageEvent) => {
      if (e.key === COUPON_STORAGE_KEY) {
        // Abort in-flight requests and invalidate sequence in this tab so pending responses cannot restore old state
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        validationSeqRef.current += 1;

        const newCode = e.newValue ? e.newValue.trim().toUpperCase() : null;
        if (!newCode) {
          setAppliedCouponCode(null);
          setAppliedCoupon(null);
          setCouponStatus('IDLE');
          setCouponError(null);
          setIsValidatingCoupon(false);
        } else {
          setAppliedCouponCode(newCode);
          setAppliedCoupon(null);
          setCouponStatus('VALIDATING');
          setCouponError(null);
          setIsValidatingCoupon(true);
        }
      } else if (e.key === CART_STORAGE_KEY) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        validationSeqRef.current += 1;

        try {
          if (e.newValue) {
            setItems(JSON.parse(e.newValue));
          } else {
            setItems([]);
          }
        } catch {}
      }
    };

    const syncFromStorage = () => {
      try {
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          setItems(parsed);
        }
        const savedCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
        const cleanCoupon = savedCoupon ? savedCoupon.trim().toUpperCase() : null;

        setAppliedCouponCode((prev) => {
          if (prev !== cleanCoupon) {
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            validationSeqRef.current += 1;

            if (!cleanCoupon) {
              setAppliedCoupon(null);
              setCouponStatus('IDLE');
              setCouponError(null);
              setIsValidatingCoupon(false);
            } else {
              setAppliedCoupon(null);
              setCouponStatus('VALIDATING');
              setCouponError(null);
              setIsValidatingCoupon(true);
            }
            return cleanCoupon;
          }
          return prev;
        });
      } catch {}
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('royal_libas_cart_update', syncFromStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('royal_libas_cart_update', syncFromStorage);
    };
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0));

  const couponDiscount = appliedCoupon?.valid ? roundCurrency(Number(appliedCoupon.discount)) : 0;

  const removeCoupon = useCallback(() => {
    // Abort in-flight requests and invalidate any pending sequence
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    validationSeqRef.current += 1;

    setAppliedCouponCode(null);
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponStatus('IDLE');
    setIsValidatingCoupon(false);
    try {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    } catch {}
  }, []);

  const revalidateCoupon = useCallback(async (currentSubtotal?: number): Promise<CouponValidateResponse | null> => {
    const subtotalToUse = currentSubtotal !== undefined ? currentSubtotal : subtotal;
    const codeToValidate = appliedCouponCode;

    if (!codeToValidate) {
      setAppliedCoupon(null);
      setCouponStatus('IDLE');
      setIsValidatingCoupon(false);
      return null;
    }

    if (items.length === 0 || subtotalToUse <= 0) {
      setAppliedCoupon(null);
      setCouponStatus('IDLE');
      setIsValidatingCoupon(false);
      return null;
    }

    // Abort previous in-flight request and increment request sequence ID
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentSeq = ++validationSeqRef.current;

    setIsValidatingCoupon(true);
    setCouponStatus('VALIDATING');
    setCouponError(null);

    try {
      const res = await validateCoupon(codeToValidate, subtotalToUse, abortController.signal);
      
      // If a newer request was dispatched or coupon was removed, drop this stale response!
      if (currentSeq !== validationSeqRef.current) {
        return null;
      }

      if (res.valid) {
        const disc = roundCurrency(Number(res.discount));
        const updated = { ...res, discount: disc };
        setAppliedCoupon(updated);
        setCouponStatus('RESOLVED');
        setCouponError(null);
        return updated;
      } else {
        // Coupon became ineligible, expired, deactivated, or min order no longer met
        setAppliedCoupon(null);
        setAppliedCouponCode(null);
        setCouponStatus('REJECTED');
        setCouponError(res.message || 'Coupon is no longer eligible for this cart.');
        try {
          localStorage.removeItem(COUPON_STORAGE_KEY);
        } catch {}
        return null;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Deliberately superseded
        return null;
      }
      if (currentSeq !== validationSeqRef.current) {
        return null;
      }

      // Network or server error: do not silently retain a misleading discount
      setAppliedCoupon(null);
      setCouponStatus('ERROR');
      setCouponError('Unable to verify coupon right now. Please check your connection and retry, or remove the coupon to proceed.');
      return null;
    } finally {
      if (currentSeq === validationSeqRef.current) {
        setIsValidatingCoupon(false);
      }
    }
  }, [appliedCouponCode, subtotal, items.length]);

  const applyCoupon = async (rawCode: string): Promise<{ success: boolean; message?: string }> => {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError('Please enter a coupon code.');
      return { success: false, message: 'Please enter a coupon code.' };
    }

    if (subtotal <= 0 || items.length === 0) {
      setCouponError('Your cart is empty. Add items before applying a coupon.');
      return { success: false, message: 'Your cart is empty.' };
    }

    // Abort previous in-flight request and increment sequence ID
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentSeq = ++validationSeqRef.current;

    setAppliedCouponCode(cleanCode);
    setAppliedCoupon(null); // Clear previous coupon while validating new one
    setIsValidatingCoupon(true);
    setCouponStatus('VALIDATING');
    setCouponError(null);

    try {
      const res = await validateCoupon(cleanCode, subtotal, abortController.signal);
      
      if (currentSeq !== validationSeqRef.current) {
        return { success: false, message: 'Superseded.' };
      }

      if (res.valid) {
        const disc = roundCurrency(Number(res.discount));
        const updated = { ...res, discount: disc };
        setAppliedCouponCode(cleanCode);
        setAppliedCoupon(updated);
        setCouponStatus('RESOLVED');
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
        setCouponStatus('REJECTED');
        try {
          localStorage.removeItem(COUPON_STORAGE_KEY);
        } catch {}
        return { success: false, message: errMsg };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, message: 'Cancelled.' };
      }
      if (currentSeq !== validationSeqRef.current) {
        return { success: false, message: 'Superseded.' };
      }

      const errMsg = 'Unable to verify coupon right now. Please check your connection and retry, or remove the coupon to proceed.';
      setCouponError(errMsg);
      setAppliedCoupon(null);
      setCouponStatus('ERROR');
      return { success: false, message: errMsg };
    } finally {
      if (currentSeq === validationSeqRef.current) {
        setIsValidatingCoupon(false);
      }
    }
  };

  // Automatically revalidate coupon when cart subtotal or item count changes
  useEffect(() => {
    if (appliedCouponCode && subtotal > 0 && items.length > 0) {
      revalidateCoupon(subtotal);
    } else if (items.length === 0 || subtotal <= 0) {
      if (appliedCoupon) setAppliedCoupon(null);
      setCouponStatus('IDLE');
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
        couponStatus,
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
