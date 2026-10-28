import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
});

const CART_STORAGE_KEY = 'royal_libas_cart_v1';

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
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

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);

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
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

