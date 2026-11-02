#!/usr/bin/env bash
# For each control, print its <script setup> props/model/slot lines from the branch holding its newest version.
cd /home/confl/github/script-development/fs-packages || exit 1
while read -r comp ref; do
  [ -z "$comp" ] && continue
  f="packages/ui-form/src/components/$comp.vue"
  echo "=== $comp @ $ref"
  src=$(git show "$ref:$f" 2>/dev/null) || { echo "(missing)"; continue; }
  printf '%s\n' "$src" | sed -n '/defineProps\|defineModel\|defineSlots\|defineEmits/,/^}>()\|^}>();\|^});\|);$/p' | grep -v '^\s*$'
  printf '%s\n' "$src" | grep -o '<slot[^>]*>' | sort -u
done <<'EOF'
TextInput origin/main
FormLabel fork/ui-form/n-field-label-after
FormError fork/ui-form/p02-form-error
FormField fork/ui-form/n-form-field
Checkbox fork/ui-form/n-checkbox-switch
Switch fork/ui-form/n-checkbox-switch
NumberInput fork/ui-form/n-number-input
DateInput fork/ui-form/n-date-input
Textarea fork/ui-form/n-textarea
InputGroup fork/ui-form/n-input-group
TimeInput fork/ui-form/n-time-input
SearchInput fork/ui-form/n-search-input
PasswordInput fork/ui-form/n-password-input
RadioGroup fork/hold/344-boolean-id
CheckboxGroup fork/ui-form/n-checkbox-group
SingleSelect fork/ui-form/n-single-select
MultiSelect fork/ui-form/n-multi-select
Combobox fork/ui-form/n-combobox
GroupSelect fork/ui-form/n-group-select
MultiCombobox fork/ui-form/n-multi-combobox
GroupCombobox fork/ui-form/n-group-combobox
EOF
