import React, { createContext, useContext, ReactNode } from 'react';

export interface CartItem {
  productId: string;
  size: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  itemCount: 0,
  totalPrice: 0,
});

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Phase 0: Empty cart state only, no checkout yet.
  const emptyCartState: CartContextType = {
    items: [],
    itemCount: 0,
    totalPrice: 0,
  };

  return (
    <CartContext.Provider value={emptyCartState}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
