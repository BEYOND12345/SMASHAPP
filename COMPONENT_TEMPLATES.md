# Component Templates

Quick copy-paste templates for common UI patterns.

## Buttons

### Primary Button
```tsx
<button className="h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-brand text-white hover:bg-brandDark shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200">
  Primary Action
</button>
```

### Accent Button (CTA)
```tsx
<button className="h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-accent text-accentText hover:bg-accentDark shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200">
  Create Quote
</button>
```

### Secondary Button
```tsx
<button className="h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-surface text-primary border border-border hover:bg-gray-100 active:scale-[0.98] transition-all duration-200">
  Secondary
</button>
```

### Outline Button
```tsx
<button className="h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-white text-primary border-2 border-border hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-200">
  Cancel
</button>
```

## Cards

### Basic Card
```tsx
<div className="bg-white rounded-[24px] shadow-card border border-white/50 p-6">
  <h3 className="text-xl font-bold text-primary mb-2">Card Title</h3>
  <p className="text-sm text-secondary">Card content goes here</p>
</div>
```

### Interactive Card (Clickable)
```tsx
<div
  className="bg-white rounded-[24px] shadow-card border border-white/50 p-6 active:scale-[0.99] transition-transform duration-200 cursor-pointer"
  onClick={handleClick}
>
  <div className="flex items-center gap-4">
    <Icon className="w-6 h-6 text-brand" />
    <div className="flex-1">
      <h3 className="font-bold text-[15px] text-primary">Title</h3>
      <p className="text-sm text-secondary">Subtitle</p>
    </div>
    <ChevronRight className="w-5 h-5 text-tertiary" />
  </div>
</div>
```

### Card with Header
```tsx
<div className="bg-white rounded-[24px] shadow-card border border-white/50 p-6">
  <div className="flex justify-between items-center mb-5">
    <h3 className="text-[11px] font-bold text-tertiary uppercase tracking-widest">
      Section Label
    </h3>
    <button className="text-sm font-medium text-brand">Action</button>
  </div>
  <div className="space-y-3">
    {/* Card content */}
  </div>
</div>
```

## Inputs

### Text Input
```tsx
<div>
  <label className="block text-sm font-medium text-secondary mb-2">
    Label
  </label>
  <input
    type="text"
    className="w-full h-[56px] px-4 rounded-xl border-2 border-border focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none transition-all duration-200"
    placeholder="Enter text"
  />
</div>
```

### Input with Error
```tsx
<div>
  <label className="block text-sm font-medium text-secondary mb-2">
    Email
  </label>
  <input
    type="email"
    className="w-full h-[56px] px-4 rounded-xl border-2 border-red-500 ring-2 ring-red-500/10 outline-none"
    placeholder="Enter email"
  />
  <p className="mt-2 text-sm text-red-600">Invalid email address</p>
</div>
```

### Textarea
```tsx
<div>
  <label className="block text-sm font-medium text-secondary mb-2">
    Description
  </label>
  <textarea
    className="w-full min-h-[120px] px-4 py-4 rounded-xl border-2 border-border focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none resize-none transition-all duration-200"
    placeholder="Enter description"
  />
</div>
```

## Pills / Tags

### Basic Pill
```tsx
<span className="inline-flex items-center h-8 px-3 rounded-full bg-surface border border-border text-[13px] font-medium text-primary">
  Tag Name
</span>
```

### Accent Pill
```tsx
<span className="inline-flex items-center h-8 px-3 rounded-full bg-accent text-accentText text-[13px] font-bold">
  Active
</span>
```

### Pill with Icon
```tsx
<span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface border border-border text-[13px] font-medium text-primary">
  <Check className="w-4 h-4" />
  Completed
</span>
```

## Lists

### List Container
```tsx
<div className="space-y-3">
  {items.map(item => (
    <div
      key={item.id}
      className="bg-white rounded-[24px] shadow-card border border-white/50 p-6 active:scale-[0.99] transition-transform duration-200 cursor-pointer"
    >
      {/* List item content */}
    </div>
  ))}
</div>
```

### List Item with Icon
```tsx
<div className="flex items-center gap-4">
  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
    <Icon className="w-5 h-5 text-accentText" />
  </div>
  <div className="flex-1 min-w-0">
    <h3 className="font-bold text-[15px] text-primary truncate">Item Title</h3>
    <p className="text-sm text-secondary truncate">Item subtitle</p>
  </div>
  <span className="text-sm font-medium text-tertiary">$150</span>
</div>
```

## Bottom Sheets

### Bottom Sheet Container
```tsx
<div className="fixed inset-0 z-50 flex items-end">
  {/* Backdrop */}
  <div
    className="absolute inset-0 bg-black/50 transition-opacity duration-200"
    onClick={handleClose}
  />

  {/* Sheet */}
  <div className="relative w-full max-w-md mx-auto bg-white rounded-t-[24px] shadow-float animate-slide-up pb-safe">
    {/* Handle */}
    <div className="flex justify-center pt-4 pb-2">
      <div className="w-10 h-1 rounded-full bg-gray-300" />
    </div>

    {/* Content */}
    <div className="px-6 pb-6">
      <h2 className="text-xl font-bold text-primary mb-4">Sheet Title</h2>
      {/* Sheet content */}
    </div>
  </div>
</div>
```

## Loading States

### Spinner
```tsx
<div className="flex items-center justify-center py-12">
  <Loader2 className="w-8 h-8 text-brand animate-spin" />
</div>
```

### Loading Card
```tsx
<div className="bg-white rounded-[24px] shadow-card border border-white/50 p-6">
  <div className="space-y-3">
    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
    <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
  </div>
</div>
```

## Empty States

### Empty List
```tsx
<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
  <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-tertiary" />
  </div>
  <h3 className="text-xl font-bold text-primary mb-2">No items yet</h3>
  <p className="text-sm text-secondary mb-6 max-w-xs">
    Get started by creating your first item
  </p>
  <button className="h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-accent text-accentText hover:bg-accentDark shadow-md active:scale-[0.98] transition-all duration-200">
    Create Item
  </button>
</div>
```

## Page Layout

### Mobile Container
```tsx
<div className="min-h-screen bg-surface">
  <div className="max-w-md mx-auto">
    {/* Page content */}
  </div>
</div>
```

### Page with Header
```tsx
<div className="min-h-screen bg-surface pb-safe">
  {/* Header */}
  <header className="sticky top-0 z-10 bg-white border-b border-border">
    <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between">
      <button onClick={handleBack}>
        <ArrowLeft className="w-6 h-6 text-brand" />
      </button>
      <h1 className="text-[17px] font-bold text-primary">Page Title</h1>
      <button>
        <MoreVertical className="w-6 h-6 text-brand" />
      </button>
    </div>
  </header>

  {/* Content */}
  <main className="max-w-md mx-auto p-5 space-y-5">
    {/* Page content */}
  </main>
</div>
```

### Section Layout
```tsx
<section className="p-5 space-y-5">
  <div className="flex justify-between items-center">
    <h2 className="text-xl font-bold text-primary">Section Title</h2>
    <button className="text-sm font-medium text-brand">See All</button>
  </div>

  <div className="space-y-3">
    {/* Section cards */}
  </div>
</section>
```

## Forms

### Basic Form
```tsx
<form className="space-y-4" onSubmit={handleSubmit}>
  <div>
    <label className="block text-sm font-medium text-secondary mb-2">
      Name
    </label>
    <input
      type="text"
      className="w-full h-[56px] px-4 rounded-xl border-2 border-border focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none transition-all duration-200"
      placeholder="Enter name"
    />
  </div>

  <div>
    <label className="block text-sm font-medium text-secondary mb-2">
      Email
    </label>
    <input
      type="email"
      className="w-full h-[56px] px-4 rounded-xl border-2 border-border focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none transition-all duration-200"
      placeholder="Enter email"
    />
  </div>

  <button
    type="submit"
    className="w-full h-[56px] px-6 rounded-2xl font-bold text-[15px] bg-accent text-accentText hover:bg-accentDark shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200"
  >
    Submit
  </button>
</form>
```

## Status Indicators

### Success Message
```tsx
<div className="flex items-center gap-3 p-4 bg-accent/10 border border-accent rounded-xl">
  <CheckCircle className="w-5 h-5 text-accentText flex-shrink-0" />
  <p className="text-sm font-medium text-accentText">
    Action completed successfully
  </p>
</div>
```

### Error Message
```tsx
<div className="flex items-center gap-3 p-4 bg-red-50 border border-red-500 rounded-xl">
  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
  <p className="text-sm font-medium text-red-600">
    Something went wrong. Please try again.
  </p>
</div>
```

### Info Message
```tsx
<div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-500 rounded-xl">
  <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
  <p className="text-sm font-medium text-blue-600">
    Here's some helpful information
  </p>
</div>
```
