import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Search, Info, Plus, Edit, Trash2, Save, X, AlertCircle, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import axios, { AxiosError } from 'axios';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';

interface PriceItem {
  id: number;
  item_id: string;
  name: string;
  category: string;
  subcategory?: string;
  unit?: string;
  price: number;
  ironing_price: number;
  express_price?: number | null;
  effective_express_price?: number;
  discount_percentage?: number;
  discount_start_date?: string;
  discount_end_date?: string;
  effective_price?: number;
  effective_ironing_price?: number;
  has_active_discount?: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

const categoryConfig = {
  gents: { label: 'Gents', icon: '👔', color: 'blue' },
  ladies: { label: 'Ladies', icon: '👗', color: 'pink' },
  general: { label: 'Household', icon: '🏠', color: 'green' },
  kids: { label: 'Kids', icon: '👶', color: 'yellow' },
  home_services: { label: 'Home Services', icon: '🏡', color: 'purple' },
};

const unitConfig = {
  piece: { label: 'Piece' },
  kg: { label: 'Kilogram' },
};


export default function PriceList() {
  const { token, canEditPrices } = useAuth();
  const { toast } = useToast();
  
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;
  
  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [selectedItem, setSelectedItem] = useState<PriceItem | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    item_id: '',
    name: '',
    category: 'gents',
    subcategory: '',
    unit: 'piece',
    price: 0,
    ironing_price: 0,
    express_price: null as number | null,
    use_auto_express: true,
    discount_percentage: 0,
    discount_start_date: '',
    discount_end_date: '',
  });

  // Fetch all price items
  const fetchPriceItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/prices`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          category: activeCategory !== 'ALL' ? activeCategory : undefined,
        },
      });
      
      setItems(response.data.prices || []);
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      console.error('Error fetching price items:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to load price items',
      });
    } finally {
      setLoading(false);
    }
  }, [token, activeCategory, toast]);

  useEffect(() => {
    if (token) {
      fetchPriceItems();
    }
  }, [token, fetchPriceItems]);

  // Filter items by category and search
  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.item_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Pagination calculation
  const totalFiltered = filteredItems.length;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Update pagination when filtered items change
  useEffect(() => {
    const pages = Math.ceil(totalFiltered / itemsPerPage);
    setTotalPages(pages || 1);
    setTotalItems(totalFiltered);
    if (currentPage > pages && pages > 0) {
      setCurrentPage(pages);
    }
  }, [totalFiltered, currentPage]);

  // Reset to page 1 when category or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

  const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

  // Handle add item
  const handleAddItem = async () => {
    if (saving) return;

    if (!formData.name || !formData.price) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields (Name and Price)',
      });
      return;
    }

    const duplicate = items.find((item) => normalizeName(item.name) === normalizeName(formData.name));
    if (duplicate) {
      toast({
        variant: 'destructive',
        title: 'Item already exists',
        description: `"${duplicate.name}" is already in the price list. Edit that item instead of adding it again.`,
      });
      return;
    }

    try {
      setSaving(true);
      const washPrice = formData.price;
      const ironingPrice = formData.ironing_price > 0
        ? formData.ironing_price
        : Math.round(washPrice / 2);

      const dataToSend = {
        name: formData.name,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        unit: formData.unit,
        price: washPrice,
        ironing_price: ironingPrice,
        express_price: formData.use_auto_express ? null : formData.express_price,
      };
      
      await axios.post(
        `${API_BASE_URL}/prices`,
        dataToSend,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'Price item added successfully with auto-generated ID',
      });

      setAddDialogOpen(false);
      setFormData({ 
        item_id: '', 
        name: '', 
        category: 'gents', 
        subcategory: '', 
        unit: 'piece',
        price: 0, 
        ironing_price: 0, 
        express_price: null,
        use_auto_express: true,
        discount_percentage: 0, 
        discount_start_date: '', 
        discount_end_date: '' 
      });
      fetchPriceItems();
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; errors?: Array<{ msg: string }> }>;
      const validationMsg = axiosError.response?.data?.errors?.map((e) => e.msg).join('; ');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: axiosError.response?.data?.error || validationMsg || 'Failed to add price item',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle edit item
  const handleEditClick = (item: PriceItem) => {
    setSelectedItem(item);
    const hasCustomExpressPrice = item.express_price !== null && item.express_price !== undefined;
    setFormData({
      item_id: item.item_id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory || '',
      unit: item.unit || 'piece',
      price: item.price,
      ironing_price: item.ironing_price,
      express_price: item.express_price || null,
      use_auto_express: !hasCustomExpressPrice,
      discount_percentage: item.discount_percentage || 0,
      discount_start_date: item.discount_start_date ? item.discount_start_date.split('T')[0] : '',
      discount_end_date: item.discount_end_date ? item.discount_end_date.split('T')[0] : '',
    });
    setEditDialogOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!selectedItem || saving) return;

    try {
      setSaving(true);
      const dataToSend = {
        ...formData,
        express_price: formData.use_auto_express ? null : formData.express_price,
      };
      
      await axios.put(
        `${API_BASE_URL}/prices/${selectedItem.id}`,
        dataToSend,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'Price item updated successfully',
      });

      setEditDialogOpen(false);
      setSelectedItem(null);
      fetchPriceItems();
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      toast({
        variant: 'destructive',
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to update price item',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle delete item
  const handleDeleteClick = (item: PriceItem) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteItem = async () => {
    if (!selectedItem || saving) return;

    try {
      setSaving(true);
      const response = await axios.delete<{ message?: string; deleted?: boolean }>(
        `${API_BASE_URL}/prices/${selectedItem.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Deleted',
        description: response.data?.message || `"${selectedItem.name}" was removed from the price list.`,
      });

      setDeleteDialogOpen(false);
      setDeleteConfirmStep(1);
      setSelectedItem(null);
      fetchPriceItems();
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; deactivated?: boolean }>;
      const wasDeactivated = axiosError.response?.data?.deactivated;

      toast({
        variant: wasDeactivated ? 'default' : 'destructive',
        title: wasDeactivated ? 'Item hidden instead of deleted' : 'Error',
        description: axiosError.response?.data?.error || 'Failed to delete price item',
      });

      if (wasDeactivated) {
        setDeleteDialogOpen(false);
        setDeleteConfirmStep(1);
        setSelectedItem(null);
        fetchPriceItems();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: PriceItem) => {
    if (saving) return;
    try {
      setSaving(true);
      await axios.put(
        `${API_BASE_URL}/prices/${item.id}`,
        { is_active: item.is_active === false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: item.is_active === false ? 'Item reactivated' : 'Item hidden',
        description: item.is_active === false
          ? `"${item.name}" is available in new orders again.`
          : `"${item.name}" no longer appears in new orders.`,
      });
      fetchPriceItems();
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      toast({
        variant: 'destructive',
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to update item',
      });
    } finally {
      setSaving(false);
    }
  };

  // Statistics
  const stats = {
    total: items.length,
    byCategory: Object.keys(categoryConfig).reduce((acc, cat) => {
      acc[cat] = items.filter(i => i.category === cat).length;
      return acc;
    }, {} as Record<string, number>),
    priceRange: items.length > 0 ? {
      min: Math.min(...items.map(i => i.price)),
      max: Math.max(...items.map(i => i.price)),
    } : { min: 0, max: 0 },
  };

  if (loading) {
    return (
      <MainLayout title="Price List" subtitle="Complete service pricing catalog">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading price items...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Price List" subtitle="Complete service pricing catalog">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        {Object.entries(categoryConfig).map(([key, config]) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <span className="mr-2">{config.icon}</span>
                {config.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byCategory[key] || 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeCategory === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory('ALL')}
          >
            All Items ({stats.total})
          </Button>
          {Object.entries(categoryConfig).map(([key, config]) => (
            <Button
              key={key}
              variant={activeCategory === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(key)}
            >
              <span className="mr-2">{config.icon}</span>
              {config.label} ({stats.byCategory[key] || 0})
            </Button>
          ))}
        </div>

        {canEditPrices && (
          <Button onClick={() => {
            setFormData({
              item_id: '',
              name: '',
              category: 'general',
              subcategory: '',
              unit: 'piece',
              price: 0,
              ironing_price: 0,
              express_price: null,
              use_auto_express: true,
              discount_percentage: 0,
              discount_start_date: '',
              discount_end_date: '',
            });
            setAddDialogOpen(true);
          }} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or item ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-secondary/10 border border-secondary/30 rounded-lg flex items-start gap-3">
        <Info className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Express & Ironing Services</p>
          <p className="text-sm text-muted-foreground">
            Express price is automatically double the wash price unless customized. Ironing price is typically half the washing price. Items with ironing price = 0 do not offer ironing service.
          </p>
        </div>
      </div>

      {/* Price Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold whitespace-nowrap">Item ID</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Item Name</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Category</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Subcategory</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Unit</TableHead>
                <TableHead className="font-semibold text-right whitespace-nowrap">Washing Price</TableHead>
                <TableHead className="font-semibold text-right whitespace-nowrap">Express Price</TableHead>
                <TableHead className="font-semibold text-right whitespace-nowrap">Ironing Price</TableHead>
                <TableHead className="font-semibold text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No items found
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-mono text-sm">{item.item_id}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className={cn(item.is_active === false && 'text-muted-foreground line-through')}>
                      {item.name}
                    </span>
                    {item.is_active === false && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Hidden
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    'capitalize',
                    item.category === 'gents' && 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
                    item.category === 'ladies' && 'bg-pink-50 dark:bg-pink-950 text-pink-700 dark:text-pink-300',
                    item.category === 'general' && 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300',
                    item.category === 'kids' && 'bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300'
                  )}>
                    {categoryConfig[item.category as keyof typeof categoryConfig]?.icon} {item.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.subcategory || '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {unitConfig[item.unit as keyof typeof unitConfig]?.label || item.unit || 'Piece'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    {item.has_active_discount ? (
                      <>
                        <span className="text-sm line-through text-muted-foreground">{formatUGX(item.price)}</span>
                        <span className="font-semibold text-primary">{formatUGX(item.effective_price || item.price)}</span>
                        <Badge variant="outline" className="text-xs bg-secondary/10 text-secondary border-secondary">
                          -{item.discount_percentage}% OFF
                        </Badge>
                      </>
                    ) : (
                      <span className="font-semibold">{formatUGX(item.price)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatUGX(item.effective_express_price || (item.price * 2))}
                    </span>
                    {item.express_price ? (
                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300">
                        Custom
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Auto (2x)</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {item.ironing_price > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      {item.has_active_discount ? (
                        <>
                          <span className="text-sm line-through text-muted-foreground">{formatUGX(item.ironing_price)}</span>
                          <span className="text-muted-foreground">{formatUGX(item.effective_ironing_price || item.ironing_price)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{formatUGX(item.ironing_price)}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-sm">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canEditPrices ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(item)}
                        aria-label="Edit price item"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {item.is_active === false ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => handleToggleActive(item)}
                          aria-label="Reactivate price item"
                        >
                          <RotateCcw className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => handleDeleteClick(item)}
                          aria-label="Delete price item"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">View only</span>
                  )}
                </TableCell>
              </TableRow>
            ))
            )}
          </TableBody>
        </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
      </div>

      {/* Empty State */}
      {paginatedItems.length === 0 && totalItems === 0 && (
        <div className="p-12 text-center bg-card rounded-lg border border-border mt-4">
          <p className="text-muted-foreground">
            {searchQuery ? `No items found matching "${searchQuery}"` : 'No price items available'}
          </p>
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add New Price Item</DialogTitle>
            <DialogDescription>
              Create a new service item with pricing information. Item ID will be auto-generated.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span>Item ID will be automatically generated by the system (e.g., g16, l25)</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gents">👔 Gents</SelectItem>
                  <SelectItem value="ladies">👗 Ladies</SelectItem>
                  <SelectItem value="general">🏠 Household</SelectItem>
                  <SelectItem value="kids">👶 Kids</SelectItem>
                  <SelectItem value="home_services">🏡 Home Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Item Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Winter Jacket"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory (optional)</Label>
              <Input
                id="subcategory"
                placeholder="e.g., Bedding"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Measurement Unit</Label>
              <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">Piece</SelectItem>
                  <SelectItem value="kg">Kilogram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Washing Price (UGX) *</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="0"
                  value={formData.price || ''}
                  onChange={(e) => {
                    const wash = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      price: wash,
                      // Keep ironing at half wash unless user already set a custom ironing price
                      ironing_price: Math.round(wash / 2),
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ironing_price">Ironing Price (UGX)</Label>
                <Input
                  id="ironing_price"
                  type="number"
                  placeholder="Auto: half wash"
                  value={formData.ironing_price || ''}
                  onChange={(e) => setFormData({ ...formData, ironing_price: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Defaults to half of wash price</p>
              </div>
            </div>

            {/* Express Price Section */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                ⚡ Express Service Pricing
              </h4>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use_auto_express"
                    checked={formData.use_auto_express}
                    onCheckedChange={(checked) => setFormData({ ...formData, use_auto_express: checked as boolean })}
                  />
                  <Label htmlFor="use_auto_express" className="text-sm font-normal cursor-pointer">
                    Automatic (2x Wash Price = {formatUGX((formData.price || 0) * 2)})
                  </Label>
                </div>
                {!formData.use_auto_express && (
                  <div className="space-y-2">
                    <Label htmlFor="express_price">Custom Express Price (UGX)</Label>
                    <Input
                      id="express_price"
                      type="number"
                      placeholder="0"
                      value={formData.express_price || ''}
                      onChange={(e) => setFormData({ ...formData, express_price: parseInt(e.target.value) || null })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Set a custom express price instead of automatic 2x calculation
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={saving} className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Adding…' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Price Item</DialogTitle>
            <DialogDescription>
              Update service item details and pricing
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-item_id">Item ID</Label>
                <Input
                  id="edit-item_id"
                  value={formData.item_id}
                  onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger id="edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gents">👔 Gents</SelectItem>
                    <SelectItem value="ladies">👗 Ladies</SelectItem>
                    <SelectItem value="general">🏠 Household</SelectItem>
                    <SelectItem value="kids">👶 Kids</SelectItem>
                    <SelectItem value="home_services">🏡 Home Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Item Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory">Subcategory</Label>
              <Input
                id="edit-subcategory"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-unit">Measurement Unit</Label>
              <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                <SelectTrigger id="edit-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">Piece</SelectItem>
                  <SelectItem value="kg">Kilogram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Washing Price (UGX)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  value={formData.price || ''}
                  onChange={(e) => {
                    const wash = parseInt(e.target.value) || 0;
                    const halfIron = Math.round(wash / 2);
                    // If ironing was exactly half of previous wash, keep the half rule in sync
                    const prevHalf = Math.round(formData.price / 2);
                    setFormData({
                      ...formData,
                      price: wash,
                      ironing_price: formData.ironing_price === prevHalf || formData.ironing_price === 0
                        ? halfIron
                        : formData.ironing_price,
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ironing_price">Ironing Price (UGX)</Label>
                <Input
                  id="edit-ironing_price"
                  type="number"
                  value={formData.ironing_price || ''}
                  onChange={(e) => setFormData({ ...formData, ironing_price: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Typically half of wash · Express defaults to 2× wash</p>
              </div>
            </div>

            {/* Express Price Section */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                ⚡ Express Service Pricing
              </h4>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit_use_auto_express"
                    checked={formData.use_auto_express}
                    onCheckedChange={(checked) => setFormData({ ...formData, use_auto_express: checked as boolean })}
                  />
                  <Label htmlFor="edit_use_auto_express" className="text-sm font-normal cursor-pointer">
                    Automatic (2x Wash Price = {formatUGX((formData.price || 0) * 2)})
                  </Label>
                </div>
                {!formData.use_auto_express && (
                  <div className="space-y-2">
                    <Label htmlFor="edit_express_price">Custom Express Price (UGX)</Label>
                    <Input
                      id="edit_express_price"
                      type="number"
                      placeholder="0"
                      value={formData.express_price || ''}
                      onChange={(e) => setFormData({ ...formData, express_price: parseInt(e.target.value) || null })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Set a custom express price instead of automatic 2x calculation
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Discount/Promotional Pricing Section */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                🎉 Promotional Discount (Optional)
              </h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-discount_percentage">Discount Percentage (%)</Label>
                  <Input
                    id="edit-discount_percentage"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formData.discount_percentage || ''}
                    onChange={(e) => setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Enter 0 to remove discount</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-discount_start_date">Start Date</Label>
                    <Input
                      id="edit-discount_start_date"
                      type="date"
                      value={formData.discount_start_date}
                      onChange={(e) => setFormData({ ...formData, discount_start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-discount_end_date">End Date</Label>
                    <Input
                      id="edit-discount_end_date"
                      type="date"
                      value={formData.discount_end_date}
                      onChange={(e) => setFormData({ ...formData, discount_end_date: e.target.value })}
                    />
                  </div>
                </div>
                {formData.discount_percentage > 0 && formData.price > 0 && (
                  <div className="p-3 bg-secondary/10 border border-secondary/30 rounded-lg">
                    <p className="text-sm font-medium text-foreground">
                      Discounted Price: <span className="text-primary">{formatUGX(formData.price * (1 - formData.discount_percentage / 100))}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Original: {formatUGX(formData.price)} • Save {formData.discount_percentage}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleUpdateItem} disabled={saving} className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Delete Price Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="py-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-semibold">{selectedItem.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedItem.item_id} • {selectedItem.category}
                </p>
                <p className="text-sm font-medium mt-2">
                  Price: {formatUGX(selectedItem.price)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Note: If this item is used in existing orders, it will be deactivated instead of deleted.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteItem} disabled={saving} className="w-full sm:w-auto">
              <Trash2 className="mr-2 h-4 w-4" />
              {saving ? 'Deleting…' : 'Delete Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary */}
      <div className="mt-6 p-6 bg-card rounded-lg border border-border">
        <h3 className="font-semibold mb-4">Price Range Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Lowest Price</p>
            <p className="text-2xl font-bold text-foreground">{formatUGX(stats.priceRange.min)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Highest Price</p>
            <p className="text-2xl font-bold text-foreground">{formatUGX(stats.priceRange.max)}</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

