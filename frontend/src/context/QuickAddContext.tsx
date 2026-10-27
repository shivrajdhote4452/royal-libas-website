import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Product } from '../types/product';

interface QuickAddContextType {
  activeProduct: Product | null;
  openQuickAdd: (product: Product) => void;
  closeQuickAdd: () => void;
}

const QuickAddContext = createContext<QuickAddContextType>({
  activeProduct: null,
  openQuickAdd: () => {},
  closeQuickAdd: () => {},
});

export const QuickAddProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const openQuickAdd = (product: Product) => setActiveProduct(product);
  const closeQuickAdd = () => setActiveProduct(null);

  return (
    <QuickAddContext.Provider value={{ activeProduct, openQuickAdd, closeQuickAdd }}>
      {children}
    </QuickAddContext.Provider>
  );
};

export const useQuickAdd = () => useContext(QuickAddContext);
