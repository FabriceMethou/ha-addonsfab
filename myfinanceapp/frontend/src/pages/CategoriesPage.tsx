// Categories Page - Transaction Types and Subtypes Management
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  FolderOpen,
  CornerDownRight,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  Badge,
  Spinner,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../components/shadcn';
import { categoriesAPI } from '../services/api';

// Common emoji options for categories
const EMOJI_OPTIONS = [
  '🍔', '🏠', '🚗', '🎮', '🛍️', '⚕️', '📚', '📊', '💰', '📈', '💵', '🔄', '🐷', '💳',
  '✈️', '🎬', '🏋️', '🎵', '🍕', '☕', '🎁', '🔧', '📱', '💻', '🏦', '🛒', '⛽', '🏥',
  '🎓', '👶', '🐕', '🌿', '🎪', '🚌', '🏢', '📝', '🔌', '💡', '🚿', '🧹', '👔', '👗',
];

// Predefined color palette
const COLOR_OPTIONS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9', '#A29BFE', '#6C5CE7',
  '#00B894', '#FDCB6E', '#636E72', '#FD79A8', '#E17055', '#74B9FF', '#55EFC4', '#81ECEC',
];

interface CategoryFormData {
  name: string;
  category: string;
  icon: string;
  color: string;
}

interface SubtypeFormData {
  name: string;
  type_id: number;
}

export default function CategoriesPage() {
  const [typeDialog, setTypeDialog] = useState(false);
  const [subtypeDialog, setSubtypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [editingSubtype, setEditingSubtype] = useState<any>(null);
  const [selectedTypeForSubtype, setSelectedTypeForSubtype] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [filterTab, setFilterTab] = useState<number | string>(0);

  const [typeForm, setTypeForm] = useState<CategoryFormData>({
    name: '',
    category: 'expense',
    icon: '',
    color: '#3b82f6',
  });

  const [subtypeForm, setSubtypeForm] = useState<SubtypeFormData>({
    name: '',
    type_id: 0,
  });

  const queryClient = useQueryClient();

  // Fetch categories hierarchy
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
  });

  // Create type mutation
  const createTypeMutation = useMutation({
    mutationFn: (data: any) => categoriesAPI.createType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setTypeDialog(false);
      resetTypeForm();
    },
  });

  // Update type mutation
  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }: any) => categoriesAPI.updateType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setTypeDialog(false);
      resetTypeForm();
      setEditingType(null);
    },
  });

  // Delete type mutation
  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => categoriesAPI.deleteType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setDeleteConfirm(null);
    },
  });

  // Create subtype mutation
  const createSubtypeMutation = useMutation({
    mutationFn: (data: any) => categoriesAPI.createSubtype(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setSubtypeDialog(false);
      resetSubtypeForm();
    },
  });

  // Update subtype mutation
  const updateSubtypeMutation = useMutation({
    mutationFn: ({ id, data }: any) => categoriesAPI.updateSubtype(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setSubtypeDialog(false);
      resetSubtypeForm();
      setEditingSubtype(null);
    },
  });

  // Delete subtype mutation
  const deleteSubtypeMutation = useMutation({
    mutationFn: (id: number) => categoriesAPI.deleteSubtype(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-hierarchy'] });
      setDeleteConfirm(null);
    },
  });

  const resetTypeForm = () => {
    setTypeForm({ name: '', category: 'expense', icon: '', color: '#3b82f6' });
  };

  const resetSubtypeForm = () => {
    setSubtypeForm({ name: '', type_id: 0 });
  };

  const handleEditType = (type: any) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      category: type.category || 'expense',
      icon: type.icon || '',
      color: type.color || '#3b82f6',
    });
    setTypeDialog(true);
  };

  const handleSubmitType = () => {
    const data = {
      name: typeForm.name,
      category: typeForm.category,
      icon: typeForm.icon || null,
      color: typeForm.color,
    };

    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, data });
    } else {
      createTypeMutation.mutate(data);
    }
  };

  // Helper to get classification icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'income':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'expense':
        return <TrendingDown className="h-4 w-4 text-error" />;
      case 'transfer':
        return <ArrowRightLeft className="h-4 w-4 text-info" />;
      default:
        return <Tag className="h-4 w-4 text-primary" />;
    }
  };

  // Helper to get badge variant
  const getCategoryBadgeVariant = (category: string): 'success' | 'destructive' | 'info' | 'default' => {
    switch (category) {
      case 'income':
        return 'success';
      case 'expense':
        return 'destructive';
      case 'transfer':
        return 'info';
      default:
        return 'default';
    }
  };

  // Filter categories based on selected tab
  const filteredCategories = categoriesData?.filter((cat: any) => {
    if (filterTab === 0) return true; // All
    if (filterTab === 1) return cat.category === 'expense';
    if (filterTab === 2) return cat.category === 'income';
    if (filterTab === 3) return cat.category === 'transfer';
    return true;
  }) || [];

  const handleAddSubtype = (type: any) => {
    setSelectedTypeForSubtype(type);
    setEditingSubtype(null);
    setSubtypeForm({ name: '', type_id: type.id });
    setSubtypeDialog(true);
  };

  const handleEditSubtype = (type: any, subtype: any) => {
    setSelectedTypeForSubtype(type);
    setEditingSubtype(subtype);
    setSubtypeForm({
      name: subtype.name,
      type_id: type.id,
    });
    setSubtypeDialog(true);
  };

  const handleSubmitSubtype = () => {
    const data = {
      name: subtypeForm.name,
      type_id: subtypeForm.type_id,
    };

    if (editingSubtype) {
      updateSubtypeMutation.mutate({ id: editingSubtype.id, data });
    } else {
      createSubtypeMutation.mutate(data);
    }
  };

  const handleDeleteType = (type: any) => {
    const subtypeCount = type.subtypes?.length || 0;
    setDeleteConfirm({
      type: 'category',
      item: type,
      warning: subtypeCount > 0 ? `This category has ${subtypeCount} subcategories. Deleting it will also delete all subcategories.` : null,
    });
  };

  const handleDeleteSubtype = (subtype: any) => {
    setDeleteConfirm({
      type: 'subcategory',
      item: subtype,
    });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.type === 'category') {
      deleteTypeMutation.mutate(deleteConfirm.item.id);
    } else if (deleteConfirm.type === 'subcategory') {
      deleteSubtypeMutation.mutate(deleteConfirm.item.id);
    }
  };

  if (categoriesLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Calculate statistics
  const totalTypes = categoriesData?.length || 0;
  const expenseCount = categoriesData?.filter((c: any) => c.category === 'expense').length || 0;
  const incomeCount = categoriesData?.filter((c: any) => c.category === 'income').length || 0;
  const transferCount = categoriesData?.filter((c: any) => c.category === 'transfer').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">
          Transaction Categories
        </h1>
        <Button
          onClick={() => {
            setEditingType(null);
            resetTypeForm();
            setTypeDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <span className="text-sm text-foreground-muted">Total Categories</span>
          </div>
          <p className="text-2xl font-bold text-primary">{totalTypes}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-error" />
            <span className="text-sm text-foreground-muted">Expense</span>
          </div>
          <p className="text-2xl font-bold text-error">{expenseCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-success" />
            <span className="text-sm text-foreground-muted">Income</span>
          </div>
          <p className="text-2xl font-bold text-success">{incomeCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft className="h-5 w-5 text-info" />
            <span className="text-sm text-foreground-muted">Transfer</span>
          </div>
          <p className="text-2xl font-bold text-info">{transferCount}</p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filterTab} onValueChange={setFilterTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value={0}>All ({totalTypes})</TabsTrigger>
          <TabsTrigger value={1}>Expense ({expenseCount})</TabsTrigger>
          <TabsTrigger value={2}>Income ({incomeCount})</TabsTrigger>
          <TabsTrigger value={3}>Transfer ({transferCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Categories List */}
      <Card className="p-6">
        {filteredCategories && filteredCategories.length > 0 ? (
          <Accordion>
            {filteredCategories.map((category: any) => (
              <AccordionItem key={category.id}>
                <AccordionTrigger>
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      {/* Icon/Emoji with color background */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xl"
                        style={{ backgroundColor: category.color || '#3b82f6' }}
                      >
                        {category.icon || <Tag className="h-5 w-5 text-white" />}
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-foreground">
                          {category.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={getCategoryBadgeVariant(category.category)}>
                            {getCategoryIcon(category.category)}
                            <span className="ml-1">{category.category || 'expense'}</span>
                          </Badge>
                          <span className="text-xs text-foreground-muted">
                            {category.subtypes?.length || 0} subcategories
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditType(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteType(category)}
                        className="text-error hover:text-error"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSubtype(category)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Subcategory
                      </Button>
                    </div>

                    {category.subtypes && category.subtypes.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subcategory Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {category.subtypes.map((subtype: any) => (
                            <TableRow key={subtype.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <CornerDownRight className="h-4 w-4 text-foreground-muted" />
                                  {subtype.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditSubtype(category, subtype)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSubtype(subtype)}
                                  className="text-error hover:text-error"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex items-center gap-2 p-4 rounded-lg bg-info/10 text-info">
                        <Info className="h-5 w-5" />
                        <p className="text-sm">No subcategories yet. Click "Add Subcategory" to create one.</p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[300px]">
            <Tag className="h-20 w-20 text-foreground-muted mb-4" />
            <h2 className="text-xl font-semibold text-foreground-muted mb-2">
              No Categories Yet
            </h2>
            <p className="text-sm text-foreground-muted mb-6">
              Create your first category to organize transactions
            </p>
            <Button
              onClick={() => {
                setEditingType(null);
                resetTypeForm();
                setTypeDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Category
            </Button>
          </div>
        )}
      </Card>

      {/* Add/Edit Type Dialog */}
      <Dialog open={typeDialog} onOpenChange={setTypeDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingType ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>
              {editingType ? 'Update the category details below.' : 'Fill in the details for your new category.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">Category Name</Label>
              <Input
                id="categoryName"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                placeholder="e.g., Income, Food, Transport"
              />
            </div>

            <div className="space-y-2">
              <Label>Classification</Label>
              <Select
                value={typeForm.category}
                onValueChange={(value) => setTypeForm({ ...typeForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-error" />
                      Expense
                    </div>
                  </SelectItem>
                  <SelectItem value="income">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-success" />
                      Income
                    </div>
                  </SelectItem>
                  <SelectItem value="transfer">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-info" />
                      Transfer
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon (Emoji)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-14 text-2xl">
                      {typeForm.icon || 'Select Icon'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <p className="text-sm text-foreground-muted mb-2">Select an icon</p>
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setTypeForm({ ...typeForm, icon: emoji })}
                          className={`w-10 h-10 text-xl rounded-md flex items-center justify-center hover:bg-surface-hover ${
                            typeForm.icon === emoji ? 'bg-primary text-white' : 'bg-surface'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full mt-2"
                      onClick={() => setTypeForm({ ...typeForm, icon: '' })}
                    >
                      Clear Icon
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-14">
                      <div
                        className="w-8 h-8 rounded-md mr-2"
                        style={{ backgroundColor: typeForm.color }}
                      />
                      {typeForm.color}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <p className="text-sm text-foreground-muted mb-2">Select a color</p>
                    <div className="flex flex-wrap gap-1">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setTypeForm({ ...typeForm, color })}
                          className={`w-10 h-10 rounded-md ${
                            typeForm.color === color ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="customColor">Custom Color</Label>
                      <div className="flex gap-2">
                        <div
                          className="w-10 h-10 rounded-md flex-shrink-0"
                          style={{ backgroundColor: typeForm.color }}
                        />
                        <Input
                          id="customColor"
                          value={typeForm.color}
                          onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                          placeholder="#RRGGBB"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-surface">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xl"
                  style={{ backgroundColor: typeForm.color }}
                >
                  {typeForm.icon || <Tag className="h-5 w-5 text-white" />}
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {typeForm.name || 'Category Name'}
                  </p>
                  <Badge variant={getCategoryBadgeVariant(typeForm.category)}>
                    {typeForm.category}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitType}
              disabled={createTypeMutation.isPending || updateTypeMutation.isPending || !typeForm.name}
            >
              {editingType ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Subtype Dialog */}
      <Dialog open={subtypeDialog} onOpenChange={setSubtypeDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {editingSubtype ? 'Edit Subcategory' : 'Create Subcategory'}
            </DialogTitle>
            {selectedTypeForSubtype && (
              <DialogDescription>
                in {selectedTypeForSubtype.name}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="subtypeName">Subcategory Name</Label>
              <Input
                id="subtypeName"
                value={subtypeForm.name}
                onChange={(e) => setSubtypeForm({ ...subtypeForm, name: e.target.value })}
                placeholder="e.g., Salary, Groceries, Public Transport"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubtypeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSubtype}
              disabled={createSubtypeMutation.isPending || updateSubtypeMutation.isPending || !subtypeForm.name}
            >
              {editingSubtype ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Are you sure you want to delete the {deleteConfirm?.type} "{deleteConfirm?.item?.name}"?
              </p>
            </div>
            {deleteConfirm?.warning && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-error/10 text-error">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{deleteConfirm.warning}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteTypeMutation.isPending || deleteSubtypeMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
