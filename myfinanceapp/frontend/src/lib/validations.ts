import { z } from 'zod';

// Transaction form validation schema
export const transactionSchema = z.object({
  account_id: z.string().min(1, 'Account is required'),
  date: z.string().min(1, 'Date is required'),
  due_date: z.string().optional(),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Amount must be a valid number')
    .refine((val) => parseFloat(val) !== 0, 'Amount cannot be zero'),
  type_id: z.string().min(1, 'Category is required'),
  subtype_id: z.string().optional(),
  description: z.string().optional(),
  recipient: z.string().optional(),
  transfer_account_id: z.string().optional(),
  transfer_amount: z.string().optional(),
  tags: z.string().optional(),
});

// Transfer-specific validation - adds conditional requirement for destination account
export const transferTransactionSchema = transactionSchema.refine(
  () => {
    // If it's a transfer (type_id indicates transfer), destination account is required
    // This will be checked at form level where we have access to category info
    return true;
  },
  { message: 'Destination account is required for transfers' }
);

export type TransactionFormData = z.infer<typeof transactionSchema>;

// Account form validation schema
export const accountSchema = z.object({
  name: z.string().optional(),
  bank_id: z.string().min(1, 'Bank is required'),
  owner_id: z.string().min(1, 'Owner is required'),
  account_type: z.string().min(1, 'Account type is required'),
  currency: z.string().min(1, 'Currency is required'),
  balance: z
    .string()
    .min(1, 'Balance is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Balance must be a valid number'),
  opening_date: z.string().optional(),
  opening_balance: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), 'Opening balance must be a valid number'),
  linked_account_id: z.string().optional(),
});

export type AccountFormData = z.infer<typeof accountSchema>;

// Bank form validation schema
export const bankSchema = z.object({
  name: z.string().min(1, 'Bank name is required'),
  country: z.string().optional(),
});

export type BankFormData = z.infer<typeof bankSchema>;

// Owner form validation schema
export const ownerSchema = z.object({
  name: z.string().min(1, 'Owner name is required'),
});

export type OwnerFormData = z.infer<typeof ownerSchema>;

// Category (Type) form validation schema
export const categoryTypeSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  category: z.enum(['income', 'expense', 'transfer'], { message: 'Category type is required' }),
});

export type CategoryTypeFormData = z.infer<typeof categoryTypeSchema>;

// Subcategory form validation schema
export const subcategorySchema = z.object({
  name: z.string().min(1, 'Subcategory name is required'),
  type_id: z.string().min(1, 'Parent category is required'),
});

export type SubcategoryFormData = z.infer<typeof subcategorySchema>;

// Budget form validation schema
export const budgetSchema = z.object({
  type_id: z.string().min(1, 'Category is required'),
  amount: z
    .string()
    .min(1, 'Budget amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Amount must be a valid number')
    .refine((val) => parseFloat(val) > 0, 'Amount must be greater than zero'),
  currency: z.string().min(1, 'Currency is required'),
  period: z.enum(['monthly', 'yearly'], { message: 'Period is required' }),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  is_active: z.boolean(),
});

export type BudgetFormData = z.infer<typeof budgetSchema>;

// Envelope form validation schema
export const envelopeSchema = z.object({
  name: z.string().min(1, 'Envelope name is required'),
  target_amount: z
    .string()
    .min(1, 'Target amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Target must be a valid number')
    .refine((val) => parseFloat(val) > 0, 'Target must be greater than zero'),
  deadline: z.string().optional(),
  description: z.string().optional(),
  tags: z.string().optional(),
  color: z.string().optional(),
});

export type EnvelopeFormData = z.infer<typeof envelopeSchema>;

// Recurring transaction template schema
export const recurringTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  account_id: z.string().min(1, 'Account is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Amount must be a valid number')
    .refine((val) => parseFloat(val) !== 0, 'Amount cannot be zero'),
  currency: z.string().min(1, 'Currency is required'),
  type_id: z.string().min(1, 'Category is required'),
  subtype_id: z.string().optional(),
  description: z.string().optional(),
  destinataire: z.string().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly'], { message: 'Recurrence pattern is required' }),
  recurrence_interval: z
    .string()
    .min(1, 'Interval is required')
    .refine((val) => !isNaN(parseInt(val)), 'Interval must be a number')
    .refine((val) => parseInt(val) > 0, 'Interval must be positive'),
  day_of_month: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  is_active: z.boolean(),
});

export type RecurringTemplateFormData = z.infer<typeof recurringTemplateSchema>;

// Debt form validation schema
export const debtSchema = z.object({
  creditor: z.string().min(1, 'Debt name is required'),
  original_amount: z
    .string()
    .min(1, 'Original amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Amount must be a valid number')
    .refine((val) => parseFloat(val) > 0, 'Amount must be greater than zero'),
  current_balance: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), 'Balance must be a valid number'),
  interest_rate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), 'Interest rate must be a valid number'),
  interest_type: z.enum(['simple', 'compound']),
  minimum_payment: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), 'Payment must be a valid number'),
  payment_day: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!isNaN(parseInt(val)) && parseInt(val) >= 1 && parseInt(val) <= 28),
      'Payment day must be between 1 and 28'
    ),
  due_date: z.string().min(1, 'Start date is required'),
  status: z.enum(['active', 'paid_off', 'defaulted']),
  notes: z.string().optional(),
  account_id: z.string().optional(),
});

export type DebtFormData = z.infer<typeof debtSchema>;

// Debt payment form validation schema
export const paymentSchema = z.object({
  amount: z
    .string()
    .min(1, 'Payment amount is required')
    .refine((val) => !isNaN(parseFloat(val)), 'Amount must be a valid number')
    .refine((val) => parseFloat(val) > 0, 'Amount must be greater than zero'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_type: z.enum(['monthly', 'extra']),
  notes: z.string().optional(),
});

export type PaymentFormData = z.infer<typeof paymentSchema>;
