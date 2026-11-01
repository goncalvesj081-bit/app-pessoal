import { loadBasics } from "@/lib/finance/data";
import { CategoryManager } from "@/components/finance/category-manager";

export default async function CategoriasPage() {
  const { categories } = await loadBasics();
  return <CategoryManager categories={categories} />;
}
