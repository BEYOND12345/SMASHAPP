import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, Save, X, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { Input } from '../components/inputs';

interface ReviewQuoteProps {
  intakeId: string;
  onBack: () => void;
  onConfirmed: () => void;
}

interface Assumption {
  field: string;
  assumption: string;
  confidence: number;
  source: string;
}

interface MissingField {
  field: string;
  reason: string;
  severity: 'required' | 'warning';
}

interface LabourEntry {
  description: string;
  hours?: { value: number | null; confidence: number } | number | null;
  days?: { value: number | null; confidence: number } | number | null;
  people?: { value: number | null; confidence: number } | number | null;
  note?: string | null;
}

interface MaterialItem {
  description: string;
  quantity: { value: number; confidence: number } | number;
  unit: { value: string; confidence: number } | string;
  unit_price_cents?: number | null;
  estimated_cost_cents?: number | null;
  needs_pricing?: boolean;
  source_store?: string | null;
  notes?: string | null;
  catalog_item_id?: string | null;
  catalog_match_confidence?: number | null;
}

interface TravelFee {
  is_time: boolean;
  hours?: { value: number | null; confidence: number } | number | null;
  fee_cents?: number | null;
}

interface ExtractionData {
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  job?: {
    title?: string;
    summary?: string;
    site_address?: string | null;
    estimated_days_min?: number | null;
    estimated_days_max?: number | null;
    job_date?: string | null;
    scope_of_work?: string[];
  };
  time?: {
    labour_entries?: LabourEntry[];
  };
  materials?: {
    items?: MaterialItem[];
  };
  fees?: {
    travel?: TravelFee;
    materials_pickup?: {
      enabled: boolean;
      minutes?: { value: number | null; confidence: number } | number | null;
      fee_cents?: number | null;
    };
    callout_fee_cents?: number | null;
  };
  quality?: {
    overall_confidence?: number;
    ambiguous_fields?: string[];
    critical_fields_below_threshold?: string[];
  };
}

interface UserCorrections {
  labour_overrides?: Record<string, number>;
  materials_overrides?: Record<string, number>;
  travel_overrides?: Record<string, number>;
  confirmed_assumptions?: string[];
}

export function ReviewQuote({ intakeId, onBack, onConfirmed }: ReviewQuoteProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criticalDataMissing, setCriticalDataMissing] = useState(false);

  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [overallConfidence, setOverallConfidence] = useState<number | null>(null);
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [originalExtractionJson, setOriginalExtractionJson] = useState<any>(null);

  const [corrections, setCorrections] = useState<UserCorrections>({
    labour_overrides: {},
    materials_overrides: {},
    travel_overrides: {},
    confirmed_assumptions: [],
  });

  const [auditPreviewExpanded, setAuditPreviewExpanded] = useState(false);

  const [catalogBrowserOpen, setCatalogBrowserOpen] = useState(false);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const firstLowConfidenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIntakeData();
  }, [intakeId]);

  async function loadIntakeData() {
    try {
      setLoading(true);
      setCriticalDataMissing(false);
      console.log('[REVIEW_FLOW] Loading intake data', { intake_id: intakeId });

      // CRITICAL: Validate intake_id first
      if (!intakeId || intakeId.trim() === '') {
        console.error('[REVIEW_FLOW] CRITICAL: Invalid intake_id', { intake_id: intakeId });
        setCriticalDataMissing(true);
        throw new Error('Invalid intake ID. Cannot load review data.');
      }

      const { data, error: fetchError } = await supabase
        .from('voice_intakes')
        .select('extraction_json, assumptions, missing_fields, user_corrections_json, transcript_text, status')
        .eq('id', intakeId)
        .maybeSingle();

      console.log('[REVIEW_FLOW] Supabase query result', {
        intake_id: intakeId,
        has_data: !!data,
        has_error: !!fetchError,
        error: fetchError?.message,
        data_keys: data ? Object.keys(data) : []
      });

      if (fetchError) {
        console.error('[REVIEW_FLOW] CRITICAL: Supabase fetch error', fetchError);
        setCriticalDataMissing(true);
        throw new Error(`Database error: ${fetchError.message}`);
      }

      if (!data) {
        console.error('[REVIEW_FLOW] CRITICAL: No data returned for intake', { intake_id: intakeId });
        setCriticalDataMissing(true);
        throw new Error('Intake not found. It may have been deleted or you may not have permission to access it.');
      }

      // CRITICAL FIELD VALIDATION - FAIL CLOSED
      if (!data.extraction_json) {
        console.error('[REVIEW_FLOW] CRITICAL: Missing extraction_json', { intake_id: intakeId, data });
        setCriticalDataMissing(true);
        throw new Error('CRITICAL: extraction_json is missing. Quote data cannot be loaded.');
      }

      if (!data.extraction_json.quality) {
        console.error('[REVIEW_FLOW] CRITICAL: Missing extraction_json.quality', { intake_id: intakeId });
        setCriticalDataMissing(true);
        throw new Error('CRITICAL: quality metadata is missing. Cannot determine confidence.');
      }

      const overallConf = data.extraction_json.quality.overall_confidence;
      if (overallConf === undefined || overallConf === null) {
        console.error('[REVIEW_FLOW] CRITICAL: Missing overall_confidence', { intake_id: intakeId });
        setCriticalDataMissing(true);
        throw new Error('CRITICAL: overall_confidence is missing. Cannot evaluate quote quality.');
      }

      console.log('[REVIEW_FLOW] All critical fields validated', {
        intake_id: intakeId,
        status: data.status,
        confidence: overallConf,
        assumptions_count: data.assumptions?.length || 0,
        missing_fields_count: data.missing_fields?.length || 0,
        has_corrections: !!data.user_corrections_json,
        user_confirmed: data.extraction_json?.quality?.user_confirmed
      });

      // HARD GUARD: If already user-confirmed, do NOT show review screen
      if (data.extraction_json?.quality?.user_confirmed === true) {
        console.log('[REVIEW_FLOW] GUARD: Intake already confirmed by user, skipping review', {
          intake_id: intakeId,
          confirmed_at: data.extraction_json.quality.user_confirmed_at
        });
        setError('This intake has already been confirmed. Proceeding to quote creation...');
        setTimeout(() => {
          onConfirmed();
        }, 1000);
        return;
      }

      // HARD GUARD: If status is not needs_user_review, don't show review
      if (data.status !== 'needs_user_review') {
        console.log('[REVIEW_FLOW] GUARD: Status is not needs_user_review, skipping', {
          intake_id: intakeId,
          status: data.status
        });
        setError(`Intake status is ${data.status}. Proceeding...`);
        setTimeout(() => {
          onConfirmed();
        }, 1000);
        return;
      }

      // ALL VALIDATIONS PASSED - Set state
      setExtractionData(data.extraction_json);
      setAssumptions(data.assumptions || []);
      setMissingFields(data.missing_fields || []);
      setOverallConfidence(overallConf); // Single source of truth
      setRawTranscript(data.transcript_text || '');
      setOriginalExtractionJson(data.extraction_json);

      // Load existing corrections if any
      if (data.user_corrections_json) {
        setCorrections(data.user_corrections_json);
      }
    } catch (err) {
      console.error('[REVIEW_FLOW] CRITICAL ERROR - Review cannot be shown', err);
      setCriticalDataMissing(true);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Auto-focus first low confidence field
  useEffect(() => {
    if (!loading && firstLowConfidenceRef.current) {
      setTimeout(() => {
        firstLowConfidenceRef.current?.focus();
      }, 100);
    }
  }, [loading]);

  function getFieldValue(field: { value?: any; confidence?: number } | any): any {
    if (field && typeof field === 'object' && 'value' in field) {
      return field.value;
    }
    return field;
  }

  function getFieldConfidence(field: { value?: any; confidence?: number } | any): number {
    if (field && typeof field === 'object' && 'confidence' in field) {
      return field.confidence || 0;
    }
    return 0.9; // Legacy format, assume high confidence
  }

  function handleLabourEdit(index: number, field: 'hours' | 'days' | 'people', value: string) {
    // Allow empty string (clearing the field)
    if (value === '') {
      const key = `labour_${index}_${field}`;
      const newOverrides = { ...corrections.labour_overrides };
      delete newOverrides[key];
      setCorrections(prev => ({
        ...prev,
        labour_overrides: newOverrides,
      }));
      return;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const key = `labour_${index}_${field}`;
    setCorrections(prev => ({
      ...prev,
      labour_overrides: {
        ...prev.labour_overrides,
        [key]: numValue,
      },
    }));
  }

  function handleMaterialEdit(index: number, value: string) {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const key = `material_${index}_quantity`;
    setCorrections(prev => ({
      ...prev,
      materials_overrides: {
        ...prev.materials_overrides,
        [key]: numValue,
      },
    }));
  }

  function handleTravelEdit(value: string) {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    setCorrections(prev => ({
      ...prev,
      travel_overrides: {
        ...prev.travel_overrides,
        travel_hours: numValue,
      },
    }));
  }

  function toggleAssumptionConfirmation(field: string) {
    setCorrections(prev => {
      const confirmed = prev.confirmed_assumptions || [];
      const isConfirmed = confirmed.includes(field);

      return {
        ...prev,
        confirmed_assumptions: isConfirmed
          ? confirmed.filter(f => f !== field)
          : [...confirmed, field],
      };
    });
  }

  function confirmAllAssumptions() {
    setCorrections(prev => ({
      ...prev,
      confirmed_assumptions: assumptions.map(a => a.field),
    }));
  }

  async function openCatalogBrowser(materialIndex: number) {
    setSelectedMaterialIndex(materialIndex);
    setCatalogBrowserOpen(true);
    setLoadingCatalog(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .rpc('get_effective_pricing_profile', { p_user_id: session.user.id });

      if (!profile) return;

      const { data: items } = await supabase
        .from('material_catalog_items')
        .select('*')
        .or(`org_id.eq.${profile.org_id},and(org_id.is.null,region_code.eq.AU)`)
        .eq('is_active', true)
        .order('category')
        .order('name');

      setCatalogItems(items || []);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }

  function selectCatalogItem(catalogItem: any) {
    if (selectedMaterialIndex === null || !extractionData?.materials?.items) return;

    const updatedExtraction = JSON.parse(JSON.stringify(extractionData));
    const material = updatedExtraction.materials.items[selectedMaterialIndex];

    // Calculate midpoint price
    let unitPrice = catalogItem.unit_price_cents;
    if (!unitPrice && catalogItem.typical_low_price_cents && catalogItem.typical_high_price_cents) {
      unitPrice = Math.round((catalogItem.typical_low_price_cents + catalogItem.typical_high_price_cents) / 2);
    }

    // Update material with catalog item
    material.catalog_item_id = catalogItem.id;
    material.catalog_match_confidence = 1.0;
    material.unit = { value: catalogItem.unit, confidence: 1.0 };
    material.unit_price_cents = unitPrice;
    material.needs_pricing = false;
    material.notes = 'From catalog - user selected';

    setExtractionData(updatedExtraction);
    setCatalogBrowserOpen(false);
    setSelectedMaterialIndex(null);
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.85) return 'green';
    if (confidence >= 0.70) return 'amber';
    return 'red';
  }

  function getConfidenceColorClasses(confidence: number): { bg: string; text: string; border: string; dot: string } {
    const color = getConfidenceColor(confidence);
    if (color === 'green') {
      return {
        bg: 'bg-green-100',
        text: 'text-green-800',
        border: 'border-green-300',
        dot: 'bg-green-500',
      };
    }
    if (color === 'amber') {
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border-amber-300',
        dot: 'bg-amber-500',
      };
    }
    return {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
      dot: 'bg-red-500',
    };
  }

  function getConfidenceSource(field: any): string {
    if (field && typeof field === 'object' && 'source' in field) {
      return field.source || 'Extracted';
    }
    return 'Extracted';
  }

  function getConfidenceTooltip(confidence: number, source: string): string {
    const color = getConfidenceColor(confidence);
    if (color === 'green') {
      return `High confidence (${(confidence * 100).toFixed(0)}%) - ${source}`;
    }
    if (color === 'amber') {
      return `Moderate confidence (${(confidence * 100).toFixed(0)}%) - ${source}. Please review.`;
    }
    return `Low confidence (${(confidence * 100).toFixed(0)}%) - ${source}. Please verify this value.`;
  }

  // REMOVED: calculateEstimatedConfidence() - Single source of truth enforced
  // Confidence value is ONLY read from extraction_json.quality.overall_confidence
  // No calculation, no estimation, no fallback to 0

  function getRemainingIssuesCount(): number {
    const unconfirmedAssumptions = assumptions.filter(
      a => !(corrections.confirmed_assumptions || []).includes(a.field)
    ).length;

    // Calculate dynamic required missing count based on corrections
    const dynamicRequiredMissing = missingFields.filter(mf => {
      if (mf.severity !== 'required') return false;

      // Check if this missing field has been corrected
      // Example: "time.labour_entries[0].hours" should be resolved if labour_0_hours exists
      const labourMatch = mf.field.match(/time\.labour_entries\[(\d+)\]\.(hours|days|people)/);
      if (labourMatch) {
        const idx = parseInt(labourMatch[1], 10);
        const field = labourMatch[2] as 'hours' | 'days' | 'people';
        const key = `labour_${idx}_${field}`;
        const hasCorrection = corrections.labour_overrides?.[key] !== undefined;
        return !hasCorrection; // Still missing if no correction
      }

      // Add similar checks for other field types if needed
      return true;
    }).length;

    return dynamicRequiredMissing + unconfirmedAssumptions;
  }

  async function handleSaveForLater() {
    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('voice_intakes')
        .update({ user_corrections_json: corrections })
        .eq('id', intakeId);

      if (updateError) throw updateError;

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save corrections');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    try {
      setSaving(true);
      setError(null);

      console.log(`[REVIEW_FLOW] CONFIRM_CLICKED intake_id=${intakeId}`);
      console.log('[REVIEW_FLOW] User clicked Confirm', {
        intake_id: intakeId,
        remaining_issues: getRemainingIssuesCount(),
        has_corrections: Object.keys(corrections.labour_overrides || {}).length > 0 ||
                         Object.keys(corrections.materials_overrides || {}).length > 0 ||
                         Object.keys(corrections.travel_overrides || {}).length > 0 ||
                         (corrections.confirmed_assumptions || []).length > 0
      });

      // CRITICAL VALIDATION: Cannot proceed if data is missing
      if (criticalDataMissing) {
        console.error('[REVIEW_FLOW] BLOCKED: Critical data missing', { intake_id: intakeId });
        setError('Cannot confirm - critical data is missing. Please refresh the page.');
        setSaving(false);
        return;
      }

      if (!intakeId || !extractionData || overallConfidence === null) {
        console.error('[REVIEW_FLOW] BLOCKED: Missing required state', {
          intake_id: intakeId,
          has_extraction: !!extractionData,
          confidence: overallConfidence
        });
        setCriticalDataMissing(true);
        setError('Cannot confirm - required data is missing. Please refresh the page.');
        setSaving(false);
        return;
      }

      // Check if required fields are still missing after applying corrections
      const stillMissingRequired = missingFields.filter(mf => {
        if (mf.severity !== 'required') return false;

        // Check if labour hours have been provided by user
        const labourMatch = mf.field.match(/time\.labour_entries\[(\d+)\]\.(hours|days|people)/);
        if (labourMatch) {
          const idx = parseInt(labourMatch[1], 10);
          const field = labourMatch[2] as 'hours' | 'days' | 'people';
          const key = `labour_${idx}_${field}`;
          const hasCorrection = corrections.labour_overrides?.[key] !== undefined;
          return !hasCorrection; // Still missing if no correction provided
        }

        return true; // For other required fields, still blocking
      });

      if (stillMissingRequired.length > 0) {
        console.log('[REVIEW_FLOW] Blocked by required fields', {
          intake_id: intakeId,
          required: stillMissingRequired.map(f => f.field)
        });
        setError('Please fill in all required fields before confirming');
        setSaving(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) throw new Error('Not authenticated');

      // CRITICAL: Do NOT re-run extraction. Just mark as user-confirmed and create quote.
      console.log('[REVIEW_FLOW] Marking intake as user-confirmed (no extraction re-run)');

      // CRITICAL: Apply user corrections to extraction_json before persisting
      const correctedExtractionJson = JSON.parse(JSON.stringify(extractionData)); // Deep clone

      // Apply labour corrections
      if (corrections.labour_overrides && correctedExtractionJson.time?.labour_entries) {
        Object.entries(corrections.labour_overrides).forEach(([key, value]) => {
          const match = key.match(/^labour_(\d+)_(hours|days|people)$/);
          if (match) {
            const idx = parseInt(match[1], 10);
            const field = match[2] as 'hours' | 'days' | 'people';
            if (correctedExtractionJson.time.labour_entries[idx]) {
              const entry = correctedExtractionJson.time.labour_entries[idx];
              // Set value and boost confidence to 1.0 (user-corrected)
              if (typeof entry[field] === 'object' || entry[field] === null || entry[field] === undefined) {
                entry[field] = { value, confidence: 1.0 };
              } else {
                entry[field] = { value, confidence: 1.0 };
              }
              console.log('[REVIEW_FLOW] Applied labour correction to extraction_json', {
                index: idx,
                field,
                value,
              });
            }
          }
        });
      }

      // Apply materials corrections
      if (corrections.materials_overrides && correctedExtractionJson.materials?.items) {
        Object.entries(corrections.materials_overrides).forEach(([key, value]) => {
          const match = key.match(/^material_(\d+)_quantity$/);
          if (match) {
            const idx = parseInt(match[1], 10);
            if (correctedExtractionJson.materials.items[idx]) {
              const item = correctedExtractionJson.materials.items[idx];
              if (typeof item.quantity === 'object') {
                item.quantity = { value, confidence: 1.0 };
              } else {
                item.quantity = { value, confidence: 1.0 };
              }
            }
          }
        });
      }

      // Apply travel corrections
      if (corrections.travel_overrides && correctedExtractionJson.fees?.travel) {
        if (corrections.travel_overrides.travel_hours !== undefined) {
          const travel = correctedExtractionJson.fees.travel;
          if (typeof travel.hours === 'object') {
            travel.hours = { value: corrections.travel_overrides.travel_hours, confidence: 1.0 };
          } else {
            travel.hours = { value: corrections.travel_overrides.travel_hours, confidence: 1.0 };
          }
        }
      }

      // Update extraction_json with user confirmation flag
      const updatedExtractionJson = {
        ...correctedExtractionJson,
        quality: {
          ...(correctedExtractionJson.quality || {}),
          user_confirmed: true,
          user_confirmed_at: new Date().toISOString(),
          requires_user_confirmation: false
        }
      };

      // Update voice_intakes with confirmation and set status to extracted
      const { error: updateError } = await supabase
        .from('voice_intakes')
        .update({
          extraction_json: updatedExtractionJson,
          user_corrections_json: corrections,
          status: 'extracted'
        })
        .eq('id', intakeId);

      if (updateError) {
        console.error('[REVIEW_FLOW] Failed to update intake', { intake_id: intakeId, error: updateError });
        throw updateError;
      }

      console.log(`[REVIEW_FLOW] MARKED_USER_CONFIRMED intake_id=${intakeId}`);
      console.log(`[REVIEW_FLOW] CALL_CREATE_DRAFT_QUOTE intake_id=${intakeId}`);

      // Now call create-draft-quote directly with the confirmed data
      const response = await fetch(`${supabaseUrl}/functions/v1/create-draft-quote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intake_id: intakeId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[REVIEW_FLOW] Quote creation failed', {
          intake_id: intakeId,
          status: response.status,
          error: errorData
        });
        throw new Error(errorData.error || 'Failed to create quote');
      }

      const result = await response.json();
      console.log(`[REVIEW_FLOW] CREATE_DRAFT_QUOTE_RESPONSE intake_id=${intakeId} success=${result.success} requires_review=${result.requires_review} quote_id=${result.quote_id}`);

      if (result.requires_review) {
        // This should NEVER happen after user confirmation
        console.error('[REVIEW_FLOW] CRITICAL: Quote creation returned requires_review=true after confirmation', {
          intake_id: intakeId,
          result
        });
        setError('System error: Review loop detected. Please contact support.');
        return;
      }

      console.log('[REVIEW_FLOW] Success - quote created, proceeding');
      onConfirmed();
    } catch (err) {
      console.error('[REVIEW_FLOW] Confirm error', { intake_id: intakeId, error: err });
      setError(err instanceof Error ? err.message : 'Failed to confirm and create quote');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  // FAIL CLOSED: If critical data is missing, do NOT render review form
  if (criticalDataMissing || !extractionData || overallConfidence === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cannot Load Review Data</h2>
            <p className="text-gray-600 mb-2">
              {error || 'Critical data is missing and the review cannot be displayed.'}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Please refresh the page or return to dashboard.
            </p>
            <Button onClick={onBack} variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const requiredMissingCount = missingFields.filter(mf => mf.severity === 'required').length;
  const warningMissingCount = missingFields.filter(mf => mf.severity === 'warning').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Review Job Details</h1>
              <p className="text-sm text-gray-600">Quick check - we\'ll build your quote next</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-32">
        {error && (
          <Card className="p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Summary Banner with Confidence Visualization */}
        <Card className="p-6 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 mb-2">
                {getRemainingIssuesCount() === 0
                  ? 'Please confirm the job details below - we\'ll build your quote next'
                  : 'We need a quick check of the job details before building your quote'}
              </h2>

              {/* Confidence Bar */}
              <div className="mt-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Confidence Level</p>
                  <p className="text-sm font-bold text-gray-900">{(overallConfidence * 100).toFixed(0)}%</p>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      getConfidenceColor(overallConfidence) === 'green'
                        ? 'bg-green-500'
                        : getConfidenceColor(overallConfidence) === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${overallConfidence * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {getConfidenceColor(overallConfidence) === 'green' && 'High confidence - job details look clear and accurate'}
                  {getConfidenceColor(overallConfidence) === 'amber' && 'Moderate confidence - please review the job details below'}
                  {getConfidenceColor(overallConfidence) === 'red' && (
                    <>
                      {getRemainingIssuesCount() === 0
                        ? 'Low overall confidence but all job details are captured - please confirm to proceed'
                        : 'Low confidence - some job details may need adjustment'}
                    </>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Assumptions Made</p>
                  <p className="text-2xl font-bold text-gray-900">{assumptions.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Fields to Review</p>
                  <p className="text-2xl font-bold text-gray-900">{requiredMissingCount + warningMissingCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Remaining Issues</p>
                  <p className="text-2xl font-bold text-gray-900">{getRemainingIssuesCount()}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Missing Fields Section */}
        {missingFields.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              Missing Information
            </h3>
            <div className="space-y-3">
              {missingFields.map((mf, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    mf.severity === 'required'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{mf.field}</p>
                      <p className="text-sm text-gray-600 mt-1">{mf.reason}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        mf.severity === 'required'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {mf.severity === 'required' ? 'Required' : 'Warning'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Assumptions Section with Inline Editing */}
        {assumptions.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Assumptions Made</h3>
              <Button
                onClick={confirmAllAssumptions}
                variant="outline"
                className="text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm All
              </Button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              We made these assumptions based on typical projects. Confirm the ones that are correct.
            </p>
            <div className="space-y-3">
              {assumptions.map((assumption, idx) => {
                const isConfirmed = corrections.confirmed_assumptions?.includes(assumption.field) || false;
                const confidenceColors = getConfidenceColorClasses(assumption.confidence);

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border transition-colors ${
                      isConfirmed
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleAssumptionConfirmation(assumption.field)}
                        className="flex-shrink-0 mt-1"
                      >
                        <CheckCircle2
                          className={`w-5 h-5 ${
                            isConfirmed ? 'text-green-600' : 'text-gray-400'
                          }`}
                        />
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`w-2 h-2 rounded-full ${confidenceColors.dot}`}
                            title={getConfidenceTooltip(assumption.confidence, assumption.source)}
                          />
                          <p className="font-medium text-gray-900">{assumption.assumption}</p>
                        </div>
                        <p className="text-xs text-gray-600">
                          {assumption.source} • Confidence: {(assumption.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Labour Entries Section with Confidence Visualization */}
        {extractionData?.time?.labour_entries && extractionData.time.labour_entries.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Labour Estimates</h3>
            <p className="text-sm text-gray-600 mb-4">
              Review and adjust labour estimates. Fill in missing values if needed.
            </p>
            <div className="space-y-4">
              {extractionData.time.labour_entries.map((entry, idx) => {
                const hoursValue = getFieldValue(entry.hours);
                const hoursConfidence = getFieldConfidence(entry.hours);
                const daysValue = getFieldValue(entry.days);
                const daysConfidence = getFieldConfidence(entry.days);
                const peopleValue = getFieldValue(entry.people);
                const peopleConfidence = getFieldConfidence(entry.people);

                const correctedHours = corrections.labour_overrides?.[`labour_${idx}_hours`];
                const correctedDays = corrections.labour_overrides?.[`labour_${idx}_days`];
                const correctedPeople = corrections.labour_overrides?.[`labour_${idx}_people`];

                const hoursColors = getConfidenceColorClasses(hoursConfidence);
                const daysColors = getConfidenceColorClasses(daysConfidence);
                const peopleColors = getConfidenceColorClasses(peopleConfidence);

                // Check if any field is missing and needs to be highlighted
                const hoursMissing = hoursValue === null || hoursValue === undefined;
                const daysMissing = daysValue === null || daysValue === undefined;
                const isFirstEntry = idx === 0;
                const shouldHighlight = hoursMissing || daysMissing || hoursConfidence < 0.7 || daysConfidence < 0.7;

                return (
                  <div key={idx} className={`p-4 rounded-lg border ${shouldHighlight ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="font-medium text-gray-900 mb-3">{entry.description}</p>
                    {shouldHighlight && (
                      <p className="text-sm text-amber-700 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Please provide labour time estimates
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1 flex items-center gap-2">
                          {hoursMissing ? (
                            <span className="w-2 h-2 rounded-full bg-red-500" title="Required - please provide hours" />
                          ) : (
                            <span
                              className={`w-2 h-2 rounded-full ${hoursColors.dot}`}
                              title={getConfidenceTooltip(hoursConfidence, getConfidenceSource(entry.hours))}
                            />
                          )}
                          Hours {hoursMissing && <span className="text-red-600 font-medium">*</span>}
                          {!hoursMissing && (
                            <span className={`${hoursColors.text} font-medium`}>
                              {(hoursConfidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </label>
                        <Input
                          ref={isFirstEntry && hoursMissing ? firstLowConfidenceRef : undefined}
                          type="number"
                          step="0.5"
                          min="0"
                          value={correctedHours !== undefined ? correctedHours : (hoursValue !== null && hoursValue !== undefined ? hoursValue : '')}
                          onChange={(e) => handleLabourEdit(idx, 'hours', e.target.value)}
                          placeholder="e.g., 4"
                          className={hoursMissing ? 'border-2 border-red-300 focus:border-red-500' : (hoursConfidence < 0.7 ? `border-2 ${hoursColors.border}` : '')}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1 flex items-center gap-2">
                          {daysMissing ? (
                            <span className="w-2 h-2 rounded-full bg-gray-400" title="Optional" />
                          ) : (
                            <span
                              className={`w-2 h-2 rounded-full ${daysColors.dot}`}
                              title={getConfidenceTooltip(daysConfidence, getConfidenceSource(entry.days))}
                            />
                          )}
                          Days
                          {!daysMissing && (
                            <span className={`${daysColors.text} font-medium`}>
                              {(daysConfidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={correctedDays !== undefined ? correctedDays : (daysValue !== null && daysValue !== undefined ? daysValue : '')}
                          onChange={(e) => handleLabourEdit(idx, 'days', e.target.value)}
                          placeholder="Optional"
                          className={!daysMissing && daysConfidence < 0.7 ? `border-2 ${daysColors.border}` : ''}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1 flex items-center gap-2">
                          {peopleValue === null || peopleValue === undefined ? (
                            <span className="w-2 h-2 rounded-full bg-gray-400" title="Optional - defaults to 1" />
                          ) : (
                            <span
                              className={`w-2 h-2 rounded-full ${peopleColors.dot}`}
                              title={getConfidenceTooltip(peopleConfidence, getConfidenceSource(entry.people))}
                            />
                          )}
                          People
                          {peopleValue !== null && peopleValue !== undefined && (
                            <span className={`${peopleColors.text} font-medium`}>
                              {(peopleConfidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={correctedPeople !== undefined ? correctedPeople : (peopleValue !== null && peopleValue !== undefined ? peopleValue : '')}
                          onChange={(e) => handleLabourEdit(idx, 'people', e.target.value)}
                          placeholder="Default: 1"
                          className={peopleValue !== null && peopleValue !== undefined && peopleConfidence < 0.7 ? `border-2 ${peopleColors.border}` : ''}
                        />
                      </div>
                    </div>
                    {entry.note && (
                      <p className="text-xs text-gray-600 mt-2">{entry.note}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Materials Section with Confidence Visualization */}
        {extractionData?.materials?.items && extractionData.materials.items.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Materials</h3>
            <p className="text-sm text-gray-600 mb-4">
              Review material quantities if needed.
            </p>
            <div className="space-y-4">
              {extractionData.materials.items.map((item, idx) => {
                const quantityValue = getFieldValue(item.quantity);
                const quantityConfidence = getFieldConfidence(item.quantity);
                const unitValue = getFieldValue(item.unit);
                const correctedQuantity = corrections.materials_overrides?.[`material_${idx}_quantity`];

                const quantityColors = getConfidenceColorClasses(quantityConfidence);

                // Determine price source indicator
                const hasCatalogLink = !!item.catalog_item_id;
                const hasPrice = item.unit_price_cents && item.unit_price_cents > 0;
                const isEstimated = !hasCatalogLink && hasPrice && item.notes?.includes('Estimated');
                const needsPricing = !hasPrice;

                let priceSourceBadge = null;
                if (hasCatalogLink) {
                  priceSourceBadge = (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                      Price guide
                    </span>
                  );
                } else if (isEstimated) {
                  priceSourceBadge = (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Estimated
                    </span>
                  );
                } else if (needsPricing) {
                  priceSourceBadge = (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      Needs price
                    </span>
                  );
                }

                return (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <p className="font-medium text-gray-900 flex-1 min-w-0 truncate">{item.description}</p>
                      <div className="flex-shrink-0">
                        {priceSourceBadge}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1 flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${quantityColors.dot}`}
                            title={getConfidenceTooltip(quantityConfidence, getConfidenceSource(item.quantity))}
                          />
                          Quantity
                          <span className={`${quantityColors.text} font-medium`}>
                            {(quantityConfidence * 100).toFixed(0)}%
                          </span>
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={correctedQuantity ?? quantityValue}
                          onChange={(e) => handleMaterialEdit(idx, e.target.value)}
                          className={quantityConfidence < 0.7 ? `border-2 ${quantityColors.border}` : ''}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Unit</label>
                        <Input
                          type="text"
                          value={unitValue}
                          disabled
                          className="bg-gray-100"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => openCatalogBrowser(idx)}
                      variant="outline"
                      className="w-full mt-3 text-sm"
                    >
                      Change Material
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Travel Section */}
        {extractionData?.fees?.travel && extractionData.fees.travel.is_time && (
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Travel Time</h3>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Travel Hours</label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={
                  corrections.travel_overrides?.travel_hours ??
                  getFieldValue(extractionData.fees.travel.hours)
                }
                onChange={(e) => handleTravelEdit(e.target.value)}
              />
            </div>
          </Card>
        )}

        {/* Read-Only Audit Preview */}
        <Card className="p-6">
          <button
            onClick={() => setAuditPreviewExpanded(!auditPreviewExpanded)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h3 className="font-semibold text-gray-900">Audit Trail</h3>
              <p className="text-xs text-gray-600 mt-1">
                View original transcript and extraction data for transparency
              </p>
            </div>
            {auditPreviewExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
            )}
          </button>

          {auditPreviewExpanded && (
            <div className="mt-4 space-y-4">
              {/* Original Transcript */}
              {rawTranscript && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-medium text-gray-900">Original Transcript</h4>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Read Only</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{rawTranscript}</p>
                  </div>
                </div>
              )}

              {/* Original Extraction JSON */}
              {originalExtractionJson && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-medium text-gray-900">Original Extraction Data</h4>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Read Only</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {JSON.stringify(originalExtractionJson, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-800">
                  This data is preserved for audit purposes and cannot be modified.
                  All corrections are stored separately and merged during quote creation.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Fixed Bottom Actions with Status Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-200 p-4 pb-safe">
        <div className="space-y-3">
          {/* Status Bar - SINGLE SOURCE OF TRUTH */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-gray-600">Confidence Level</p>
                <p className="text-lg font-bold text-gray-900">
                  {overallConfidence !== null ? `${(overallConfidence * 100).toFixed(0)}%` : 'N/A'}
                </p>
              </div>
              <div className="h-8 w-px bg-gray-300" />
              <div>
                <p className="text-xs text-gray-600">Remaining Issues</p>
                <p className="text-lg font-bold text-gray-900">{getRemainingIssuesCount()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">
                {getRemainingIssuesCount() === 0 ? (
                  <span className="text-green-600 font-medium">Ready to proceed</span>
                ) : (
                  <span className="text-amber-600 font-medium">
                    {getRemainingIssuesCount()} item{getRemainingIssuesCount() !== 1 ? 's' : ''} remaining
                  </span>
                )}
              </p>
            </div>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={saving || requiredMissingCount > 0 || criticalDataMissing || overallConfidence === null}
            className="w-full"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              getRemainingIssuesCount() === 0 ? 'Confirm Job and Build Quote' : 'Confirm & Continue'
            )}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleSaveForLater}
              disabled={saving}
              variant="outline"
            >
              <Save className="w-4 h-4" />
              Save for Later
            </Button>
            <Button
              onClick={onBack}
              disabled={saving}
              variant="outline"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Catalog Browser Modal */}
      {catalogBrowserOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Select Material from Catalog</h3>
              <button
                onClick={() => {
                  setCatalogBrowserOpen(false);
                  setSelectedMaterialIndex(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-600">Loading catalog...</p>
                </div>
              ) : catalogItems.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-600">No catalog items available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {catalogItems.map((item: any) => {
                    const midpoint = item.unit_price_cents ||
                      (item.typical_low_price_cents && item.typical_high_price_cents
                        ? Math.round((item.typical_low_price_cents + item.typical_high_price_cents) / 2)
                        : null);

                    return (
                      <button
                        key={item.id}
                        onClick={() => selectCatalogItem(item)}
                        className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                {item.category_group}
                              </span>
                              <span className="text-xs text-gray-600">{item.unit}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {midpoint ? (
                              <p className="font-semibold text-gray-900">
                                ${(midpoint / 100).toFixed(2)}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500">No price</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
