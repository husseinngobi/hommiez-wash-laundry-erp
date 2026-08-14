import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Package, AlertTriangle, Plus, Search, Trash2, Edit, AlertCircle, Clock, Settings2, Tag, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity_in_stock: number;
  reorder_level: number;
  unit_cost: number;
  supplier: string;
  last_restock_date: string;
  max_stock_quantity?: number;
  expected_duration_value?: number;
  expected_duration_unit?: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
  is_long_term?: boolean;
  low_stock_threshold_percent?: number;
  asset_value?: number | null;
  asset_purchase_date?: string | null;
  asset_serial_number?: string | null;
  asset_condition?: string | null;
  asset_location?: string | null;
  branch_id?: number | null;
  branch_name?: string | null;
}

export default function Inventory() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [newItemBranchId, setNewItemBranchId] = useState('');
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;
  
  // Restock dialog state
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [restocking, setRestocking] = useState(false);
  
  // Add/Edit item dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemStock, setNewItemStock] = useState('0');
  const [newItemReorder, setNewItemReorder] = useState('');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemSupplier, setNewItemSupplier] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');
  const [newItemDurationValue, setNewItemDurationValue] = useState('');
  const [newItemDurationUnit, setNewItemDurationUnit] = useState<'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS'>('MONTHS');
  const [newItemIsLongTerm, setNewItemIsLongTerm] = useState(false);
  const [newItemMaxStock, setNewItemMaxStock] = useState('');
  const [newItemThresholdPercent, setNewItemThresholdPercent] = useState('20');
  const [newItemAssetValue, setNewItemAssetValue] = useState('');
  const [newItemAssetPurchaseDate, setNewItemAssetPurchaseDate] = useState('');
  const [newItemAssetSerial, setNewItemAssetSerial] = useState('');
  const [newItemAssetCondition, setNewItemAssetCondition] = useState('GOOD');
  const [newItemAssetLocation, setNewItemAssetLocation] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);

  // Category filter + management
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [catEditTarget, setCatEditTarget] = useState<string | null>(null);
  const [catEditValue, setCatEditValue] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  useEffect(() => {
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, branchFilter]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBranches(res.data.branches || []))
      .catch(() => setBranches([]));
  }, [token]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (isAdminOrManager && branchFilter !== 'ALL') {
        params.branch_id = branchFilter;
      }
      const response = await axios.get(`${API_BASE_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      const fetched: InventoryItem[] = response.data.items || [];
      setItems(fetched);
      // Derive category list from returned items
      const cats = Array.from(new Set(fetched.map((i) => i.category).filter(Boolean))).sort();
      setCategoryList(cats);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load inventory',
      });
    } finally {
      setLoading(false);
    }
  };

  // Rename a category across all items in the list
  const handleRenameCategory = async (oldName: string, newName: string) => {
    const clean = newName.trim().toUpperCase().replace(/\s+/g, '_');
    if (!clean || clean === oldName) return;
    setCatSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/inventory/categories/${encodeURIComponent(oldName)}`,
        { new_name: clean },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: 'Category renamed', description: `"${oldName}" → "${clean}"` });
      setCatEditTarget(null);
      setCatEditValue('');
      if (activeCategory === oldName) setActiveCategory(clean);
      await fetchInventory();
    } catch {
      toast({ variant: 'destructive', title: 'Rename failed', description: 'Could not rename category.' });
    } finally { setCatSaving(false); }
  };

  // Add a local category (it becomes real once an item is assigned to it)
  const handleAddCategory = () => {
    const clean = newCatName.trim().toUpperCase().replace(/\s+/g, '_');
    if (!clean) return;
    if (categoryList.includes(clean)) {
      toast({ variant: 'destructive', title: 'Already exists', description: `Category "${clean}" already exists.` });
      return;
    }
    setCategoryList((prev) => [...prev, clean].sort());
    setNewCatName('');
    toast({ title: 'Category added', description: `"${clean}" is now selectable. Assign items to persist it.` });
  };

  const handleRestock = async () => {
    if (!selectedItem || !restockQuantity) return;

    try {
      setRestocking(true);
      await axios.post(
        `${API_BASE_URL}/inventory/restock`,
        {
          item_id: selectedItem.id,
          quantity: parseFloat(restockQuantity),
          unit_cost: restockCost ? parseFloat(restockCost) : selectedItem.unit_cost,
          notes: restockNotes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Stock Added',
        description: `${restockQuantity} ${selectedItem.unit} added to ${selectedItem.name}`,
      });

      setShowRestockDialog(false);
      setRestockQuantity('');
      setRestockCost('');
      setRestockNotes('');
      setSelectedItem(null);
      fetchInventory();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add stock',
      });
    } finally {
      setRestocking(false);
    }
  };

  const openRestockDialog = (item: InventoryItem) => {
    setSelectedItem(item);
    setRestockCost(item.unit_cost.toString());
    setShowRestockDialog(true);
  };

  const openEditDialog = (item: InventoryItem) => {
    setIsEditing(true);
    setEditingItemId(item.id);
    setNewItemName(item.name);
    setNewItemCategory(item.category);
    setNewItemUnit(item.unit);
    setNewItemStock(item.quantity_in_stock.toString());
    setNewItemReorder(item.reorder_level.toString());
    setNewItemCost(item.unit_cost.toString());
    setNewItemSupplier(item.supplier || '');
    setNewItemNotes('');
    setNewItemMaxStock(item.max_stock_quantity?.toString() || '');
    setNewItemDurationValue(item.expected_duration_value?.toString() || '');
    setNewItemDurationUnit(item.expected_duration_unit || 'MONTHS');
    setNewItemIsLongTerm(item.is_long_term || false);
    setNewItemThresholdPercent(item.low_stock_threshold_percent?.toString() || '20');
    setNewItemAssetValue((item.asset_value ?? item.unit_cost)?.toString() || '');
    setNewItemAssetPurchaseDate(item.asset_purchase_date ? String(item.asset_purchase_date).slice(0, 10) : '');
    setNewItemAssetSerial(item.asset_serial_number || '');
    setNewItemAssetCondition(item.asset_condition || 'GOOD');
    setNewItemAssetLocation(item.asset_location || '');
    setNewItemBranchId(item.branch_id ? String(item.branch_id) : '');
    setShowAddDialog(true);
  };

  const openAddDialog = () => {
    setIsEditing(false);
    setEditingItemId(null);
    resetAddForm();
    setShowAddDialog(true);
  };

  const handleAddItem = async () => {
    if (!newItemName || !newItemCategory) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Item name and category are required',
      });
      return;
    }

    if (newItemIsLongTerm) {
      if (!newItemAssetValue) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Asset value (worth) is required for long-term assets',
        });
        return;
      }
    } else if (!newItemUnit || !newItemReorder || !newItemCost) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please fill in all required fields',
      });
      return;
    }

    try {
      setAdding(true);
      
      const itemData = {
        item_name: newItemName,
        category: newItemCategory,
        unit: newItemIsLongTerm ? (newItemUnit || 'ASSET') : newItemUnit,
        quantity_in_stock: newItemIsLongTerm ? Math.max(1, parseFloat(newItemStock) || 1) : parseFloat(newItemStock),
        reorder_level: newItemIsLongTerm ? 0 : parseFloat(newItemReorder),
        unit_cost: newItemIsLongTerm
          ? parseFloat(newItemAssetValue)
          : parseFloat(newItemCost),
        supplier: newItemSupplier,
        notes: newItemNotes,
        max_stock_quantity: newItemIsLongTerm ? null : (newItemMaxStock ? parseFloat(newItemMaxStock) : null),
        expected_duration_value: newItemIsLongTerm ? null : (newItemDurationValue ? parseFloat(newItemDurationValue) : null),
        expected_duration_unit: newItemIsLongTerm ? null : (newItemDurationValue ? newItemDurationUnit : null),
        is_long_term: newItemIsLongTerm,
        low_stock_threshold_percent: newItemIsLongTerm ? 20 : parseFloat(newItemThresholdPercent),
        asset_value: newItemIsLongTerm ? parseFloat(newItemAssetValue) : null,
        asset_purchase_date: newItemIsLongTerm && newItemAssetPurchaseDate ? newItemAssetPurchaseDate : null,
        asset_serial_number: newItemIsLongTerm ? (newItemAssetSerial || null) : null,
        asset_condition: newItemIsLongTerm ? newItemAssetCondition : null,
        asset_location: newItemIsLongTerm ? (newItemAssetLocation || null) : null,
        branch_id: newItemBranchId ? Number(newItemBranchId) : undefined,
      };

      if (isEditing && editingItemId) {
        // Update existing item
        await axios.put(
          `${API_BASE_URL}/inventory/${editingItemId}`,
          itemData,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast({
          title: 'Item Updated',
          description: `${newItemName} has been updated successfully`,
        });
      } else {
        // Add new item
        await axios.post(
          `${API_BASE_URL}/inventory`,
          itemData,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast({
          title: 'Item Added',
          description: `${newItemName} has been added to inventory`,
        });
      }

      setShowAddDialog(false);
      resetAddForm();
      fetchInventory();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: isEditing ? 'Failed to update item' : 'Failed to add item',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteItem = (item: InventoryItem) => {
    setItemToDelete(item);
    setShowDeleteDialog(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      await axios.delete(`${API_BASE_URL}/inventory/${itemToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: 'Item Deleted',
        description: `${itemToDelete.name} has been removed from inventory`,
      });

      setShowDeleteDialog(false);
      setDeleteConfirmStep(1);
      setItemToDelete(null);
      fetchInventory();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete item',
      });
    }
  };

  const resetAddForm = () => {
    setNewItemName('');
    setNewItemCategory('');
    setNewItemUnit('');
    setNewItemStock('0');
    setNewItemReorder('');
    setNewItemCost('');
    setNewItemSupplier('');
    setNewItemNotes('');
    setNewItemMaxStock('');
    setNewItemDurationValue('');
    setNewItemDurationUnit('MONTHS');
    setNewItemIsLongTerm(false);
    setNewItemThresholdPercent('20');
    setNewItemAssetValue('');
    setNewItemAssetPurchaseDate('');
    setNewItemAssetSerial('');
    setNewItemAssetCondition('GOOD');
    setNewItemAssetLocation('');
    setNewItemBranchId(user?.branch_id ? String(user.branch_id) : '');
  };

  const filteredItems = items.filter((item) => {
    // Category tab filter
    if (activeCategory === 'ASSETS') {
      if (!item.is_long_term) return false;
    } else if (activeCategory !== 'ALL') {
      if ((item.category || '').toUpperCase() !== activeCategory) return false;
    }
    // Text search: name, category, supplier, unit; also "long term"/"asset" matches is_long_term
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchesText =
        item.name?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.supplier?.toLowerCase().includes(q) ||
        item.unit?.toLowerCase().includes(q);
      const matchesType =
        item.is_long_term && (q.includes('long') || q.includes('asset') || q.includes('equipment'));
      return matchesText || matchesType;
    }
    return true;
  });

  // Pagination
  const totalFiltered = filteredItems.length;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Update total pages when filtered items change
  useEffect(() => {
    const pages = Math.ceil(totalFiltered / itemsPerPage);
    setTotalPages(pages || 1);
    setTotalItems(totalFiltered);
    if (currentPage > pages && pages > 0) {
      setCurrentPage(pages);
    }
  }, [totalFiltered, currentPage]);

  // Calculate consumption rate and stock status
  const calculateStockStatus = (item: InventoryItem): { 
    daysRemaining: number | null; 
    dailyConsumption: number | null;
    lowStockThreshold: number;
  } => {
    // Calculate low stock threshold
    let lowStockThreshold = item.reorder_level;
    if (item.max_stock_quantity && item.low_stock_threshold_percent) {
      lowStockThreshold = (item.max_stock_quantity * item.low_stock_threshold_percent) / 100;
    }

    // If no duration data, return quantity-based only
    if (!item.max_stock_quantity || !item.expected_duration_value || !item.expected_duration_unit) {
      return { daysRemaining: null, dailyConsumption: null, lowStockThreshold };
    }

    // Convert duration to days
    let durationInDays = 0;
    switch (item.expected_duration_unit) {
      case 'DAYS':
        durationInDays = item.expected_duration_value;
        break;
      case 'WEEKS':
        durationInDays = item.expected_duration_value * 7;
        break;
      case 'MONTHS':
        durationInDays = item.expected_duration_value * 30;
        break;
      case 'YEARS':
        durationInDays = item.expected_duration_value * 365;
        break;
    }

    // Calculate daily consumption rate (max stock / duration)
    const dailyConsumption = item.max_stock_quantity / durationInDays;

    // Calculate days remaining (current stock / daily consumption)
    const daysRemaining = dailyConsumption > 0 ? item.quantity_in_stock / dailyConsumption : null;

    return { daysRemaining, dailyConsumption, lowStockThreshold };
  };

  const isItemLowStock = (item: InventoryItem): boolean => {
    // If marked as long-term, never show as low stock
    if (item.is_long_term) {
      return false;
    }

    const { lowStockThreshold } = calculateStockStatus(item);
    
    // Check if current stock is below threshold
    return item.quantity_in_stock <= lowStockThreshold;
  };

  const lowStockItems = items.filter(item => isItemLowStock(item));
  const totalValue = items.reduce((sum, item) => sum + (item.quantity_in_stock * item.unit_cost), 0);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      DETERGENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      CHEMICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      PACKAGING: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      HANGER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
      ACCESSORY: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      EQUIPMENT: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
  };

  return (
    <MainLayout title="Inventory" subtitle="Track supplies and materials">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-destructive">{lowStockItems.length}</div>
              {lowStockItems.length > 0 && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUGX(totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, category, supplier, unit or type 'asset'…"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-10"
            />
          </div>
          {isAdminOrManager && branches.length > 1 && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdminOrManager && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button onClick={openAddDialog} className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Manage Categories"
                onClick={() => setShowCatDialog(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'ASSETS', ...categoryList] as string[]).map((cat) => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setCurrentPage(1); }}
              className={[
                'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              ].join(' ')}
            >
              {cat === 'ALL' ? 'All Items' : cat === 'ASSETS' ? '🏭 Long-Term Assets' : cat.replace(/_/g, ' ')}
              {cat !== 'ALL' && cat !== 'ASSETS' && (
                <span className="opacity-60 font-normal">
                  ({items.filter((i) => (i.category || '').toUpperCase() === cat).length})
                </span>
              )}
              {cat === 'ASSETS' && (
                <span className="opacity-60 font-normal">({items.filter((i) => i.is_long_term).length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : paginatedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {filteredItems.length === 0 ? 'No items found' : 'No items on this page'}
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Item Name</TableHead>
                  <TableHead className="whitespace-nowrap">Category</TableHead>
                  <TableHead className="whitespace-nowrap">Branch</TableHead>
                  <TableHead className="text-right whitespace-nowrap">In Stock</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Reorder Level</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Unit Cost</TableHead>
                  <TableHead className="whitespace-nowrap">Supplier</TableHead>
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item) => {
                  const isLowStock = isItemLowStock(item);
                  const { daysRemaining, dailyConsumption, lowStockThreshold } = calculateStockStatus(item);
                  return (
                    <TableRow key={item.id} className={isLowStock ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-medium">
                        <div>
                          {item.name}
                          {item.is_long_term && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Long-Term
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getCategoryColor(item.category)}>
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.branch_name || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <span className={isLowStock ? 'text-destructive font-semibold' : ''}>
                            {item.quantity_in_stock} {item.unit}
                          </span>
                          {daysRemaining !== null && dailyConsumption !== null && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {daysRemaining > 0 ? (
                                <>
                                  <span className={isLowStock ? 'text-orange-600 font-medium' : ''}>
                                    ~{Math.round(daysRemaining)} days left
                                  </span>
                                  <br />
                                  <span className="text-xs">
                                    ({dailyConsumption.toFixed(2)} {item.unit}/day)
                                  </span>
                                </>
                              ) : (
                                <span className="text-destructive font-medium">Depleted</span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.is_long_term ? '—' : `${item.reorder_level} ${item.unit}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatUGX(item.unit_cost)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.supplier || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!item.is_long_term && (
                            <Button
                              size="sm"
                              variant={isLowStock ? "default" : "outline"}
                              onClick={() => openRestockDialog(item)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Restock
                            </Button>
                          )}
                          {item.is_long_term && isAdminOrManager && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(item)}
                              title="Edit asset"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          )}
                          {!item.is_long_term && isAdminOrManager && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(item)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteItem(item)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} items
                </div>
                <Pagination>
                  <PaginationContent className="flex-wrap justify-center sm:justify-end">
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Restock Dialog */}
      <Dialog open={showRestockDialog} onOpenChange={setShowRestockDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
            <DialogDescription>
              Add stock for {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Stock</Label>
              <Input
                value={`${selectedItem?.quantity_in_stock} ${selectedItem?.unit}`}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity to Add *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={`Enter quantity in ${selectedItem?.unit}`}
                value={restockQuantity}
                onChange={(e) => setRestockQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost</Label>
              <Input
                type="number"
                min="0"
                placeholder="Cost per unit"
                value={restockCost}
                onChange={(e) => setRestockCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Any notes about this restock..."
                value={restockNotes}
                onChange={(e) => setRestockNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowRestockDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleRestock} disabled={restocking || !restockQuantity} className="w-full sm:w-auto">
              {restocking ? 'Adding...' : 'Add Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Inventory Item' : 'Add New Inventory Item'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update the details of this inventory item' : 'Add a new item to your inventory'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input
                  placeholder="e.g., Ariel Detergent"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              </div>
              {isAdminOrManager && branches.length > 0 && (
                <div className="space-y-2">
                  <Label>Branch *</Label>
                  <Select value={newItemBranchId} onValueChange={setNewItemBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoryList.length > 0
                      ? categoryList
                      : ['DETERGENT', 'CHEMICAL', 'PACKAGING', 'HANGER', 'ACCESSORY', 'EQUIPMENT']
                    ).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Item type decides the whole rest of the form */}
            <div className="flex items-start space-x-2 rounded-lg border border-border p-3">
              <Checkbox
                id="is-long-term"
                className="mt-0.5 shrink-0"
                checked={newItemIsLongTerm}
                onCheckedChange={(checked) => {
                  const on = checked as boolean;
                  setNewItemIsLongTerm(on);
                  if (on) {
                    if (!newItemUnit) setNewItemUnit('ASSET');
                    if (!newItemCategory) setNewItemCategory('EQUIPMENT');
                    if (!newItemAssetValue && newItemCost) setNewItemAssetValue(newItemCost);
                  }
                }}
              />
              <label htmlFor="is-long-term" className="min-w-0 text-sm leading-snug cursor-pointer">
                <span className="font-medium">Mark as long-term asset</span>
                <span className="block text-muted-foreground">
                  Equipment, machines and devices. Stock levels, reorder alerts and
                  consumption tracking do not apply — you record the asset&apos;s worth instead.
                </span>
              </label>
            </div>

            <div
              className={cn(
                'grid gap-4',
                newItemIsLongTerm ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'
              )}
            >
              <div className="space-y-2">
                <Label>Unit *</Label>
                <Select value={newItemUnit} onValueChange={setNewItemUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="liters">Liters</SelectItem>
                    <SelectItem value="pieces">Pieces</SelectItem>
                    <SelectItem value="ASSET">Asset (unit)</SelectItem>
                    <SelectItem value="boxes">Boxes</SelectItem>
                    <SelectItem value="rolls">Rolls</SelectItem>
                    <SelectItem value="units">Units</SelectItem>
                    <SelectItem value="sets">Sets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!newItemIsLongTerm && (
                <>
                  <div className="space-y-2">
                    <Label>Initial Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={newItemStock}
                      onChange={(e) => setNewItemStock(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reorder Level *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Minimum stock level"
                      value={newItemReorder}
                      onChange={(e) => setNewItemReorder(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!newItemIsLongTerm && (
                <div className="space-y-2">
                  <Label>Unit Cost (UGX) *</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Cost per unit"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{newItemIsLongTerm ? 'Supplier / vendor' : 'Supplier'}</Label>
                <Input
                  placeholder="e.g., Unilever Uganda"
                  value={newItemSupplier}
                  onChange={(e) => setNewItemSupplier(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Additional information about this item..."
                value={newItemNotes}
                onChange={(e) => setNewItemNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Asset details, or smart stock tracking — never both */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-primary" />
                <h4 className="font-semibold">
                  {newItemIsLongTerm ? 'Asset Details' : 'Smart Stock Tracking'}
                </h4>
              </div>
              
              <div className="space-y-4">
                {newItemIsLongTerm && (
                  <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Record the asset&apos;s worth and identifying details. Smart stock alerts do not apply.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Asset value / worth (UGX) *</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="e.g., 3500000"
                          value={newItemAssetValue}
                          onChange={(e) => setNewItemAssetValue(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Purchase date</Label>
                        <Input
                          type="date"
                          value={newItemAssetPurchaseDate}
                          onChange={(e) => setNewItemAssetPurchaseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Serial / tag number</Label>
                        <Input
                          placeholder="e.g., WM-2024-001"
                          value={newItemAssetSerial}
                          onChange={(e) => setNewItemAssetSerial(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Condition</Label>
                        <Select value={newItemAssetCondition} onValueChange={setNewItemAssetCondition}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NEW">New</SelectItem>
                            <SelectItem value="GOOD">Good</SelectItem>
                            <SelectItem value="FAIR">Fair</SelectItem>
                            <SelectItem value="NEEDS_REPAIR">Needs repair</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Asset location</Label>
                      <Input
                        placeholder="e.g., Main shop floor / Office"
                        value={newItemAssetLocation}
                        onChange={(e) => setNewItemAssetLocation(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {!newItemIsLongTerm && (
                  <>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Set max stock and expected duration to calculate consumption rate and automatic alerts
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Maximum Stock Quantity *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g., 100"
                            value={newItemMaxStock}
                            onChange={(e) => setNewItemMaxStock(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            The highest quantity you typically stock
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Low Stock Threshold (%)</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            placeholder="20"
                            value={newItemThresholdPercent}
                            onChange={(e) => setNewItemThresholdPercent(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Alert when stock drops below this % of max
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Expected Duration (Max Stock Should Last)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="e.g., 3"
                            value={newItemDurationValue}
                            onChange={(e) => setNewItemDurationValue(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            How long max stock should last
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Duration Unit</Label>
                          <Select value={newItemDurationUnit} onValueChange={(value: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS') => setNewItemDurationUnit(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DAYS">Days</SelectItem>
                              <SelectItem value="WEEKS">Weeks</SelectItem>
                              <SelectItem value="MONTHS">Months</SelectItem>
                              <SelectItem value="YEARS">Years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {newItemMaxStock && newItemDurationValue && (
                        <div className="bg-primary/10 p-3 rounded border border-primary/20">
                          <p className="text-sm font-medium mb-1">Automatic Calculation:</p>
                          <ul className="text-xs space-y-1 text-muted-foreground">
                            <li>• Daily consumption: {(parseFloat(newItemMaxStock) / (parseFloat(newItemDurationValue) * (newItemDurationUnit === 'DAYS' ? 1 : newItemDurationUnit === 'WEEKS' ? 7 : newItemDurationUnit === 'MONTHS' ? 30 : 365))).toFixed(2)} {newItemUnit || 'units'}/day</li>
                            <li>• Low stock alert at: {((parseFloat(newItemMaxStock) * parseFloat(newItemThresholdPercent)) / 100).toFixed(2)} {newItemUnit || 'units'}</li>
                            <li>• System will calculate days remaining based on current stock</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetAddForm(); }} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={adding} className="w-full sm:w-auto">
              {adding ? (isEditing ? 'Updating...' : 'Adding...') : (isEditing ? 'Update Item' : 'Add Item')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog — admin/manager only */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Manage Inventory Categories
            </DialogTitle>
            <DialogDescription>
              Rename or add categories. Categories with items cannot be deleted — reassign items first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-72 overflow-y-auto pr-1">
            {categoryList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No categories yet.</p>
            )}
            {categoryList.map((cat) => {
              const count = items.filter((i) => (i.category || '').toUpperCase() === cat).length;
              const isEditing = catEditTarget === cat;
              return (
                <div key={cat} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  {isEditing ? (
                    <>
                      <Input
                        className="h-7 text-sm flex-1"
                        value={catEditValue}
                        onChange={(e) => setCatEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameCategory(cat, catEditValue);
                          if (e.key === 'Escape') { setCatEditTarget(null); setCatEditValue(''); }
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={catSaving}
                        onClick={() => handleRenameCategory(cat, catEditValue)}
                        className="h-7 px-2"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => { setCatEditTarget(null); setCatEditValue(''); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{cat.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => { setCatEditTarget(cat); setCatEditValue(cat); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add new category */}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="New category name…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleAddCategory} disabled={!newCatName.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) {
          setDeleteConfirmStep(1);
          setItemToDelete(null);
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Delete Inventory Item</DialogTitle>
            <DialogDescription>
              {deleteConfirmStep === 1 ? (
                `Are you sure you want to delete "${itemToDelete?.name}"? This will deactivate the item.`
              ) : (
                "This is your final confirmation. The item will be soft-deleted (deactivated)."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {deleteConfirmStep === 2 && itemToDelete && (
            <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950 p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">⚠️ Final Warning</h4>
                  <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                    You are about to deactivate:
                  </p>
                  <ul className="text-sm text-red-800 dark:text-red-200 list-disc list-inside space-y-1">
                    <li>Item: <strong>{itemToDelete.name}</strong></li>
                    <li>Category: {itemToDelete.category}</li>
                    <li>Current Stock: {itemToDelete.quantity_in_stock} {itemToDelete.unit}</li>
                  </ul>
                  <p className="text-sm text-red-800 dark:text-red-200 mt-3 font-semibold">
                    Note: This is a soft delete. Item can be restored later if needed.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {deleteConfirmStep === 1 ? (
              <>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteConfirmStep(2)}
                  className="w-full sm:w-auto"
                >
                  Delete Item
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteConfirmStep(1)}
                  className="w-full sm:w-auto"
                >
                  Go Back
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={confirmDeleteItem}
                  className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                >
                  Yes, Delete (Deactivate)
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
