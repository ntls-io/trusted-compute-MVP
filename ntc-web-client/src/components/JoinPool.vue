<template>
  <div>
    <h4>Pool Name</h4>
    <p>Pool Description</p>
    <h5>Digital Rights</h5>
    <b-form-row>
      <b-col cols="auto">
        <b-card body-class="p-2">ytvyrtcvgub</b-card>
      </b-col>
      <b-col cols="auto">
        <b-card body-class="p-2">sftgrefr</b-card>
      </b-col>
      <b-col cols="auto">
        <b-card body-class="p-2">uynioinuiy</b-card>
      </b-col>
      <b-col cols="auto">
        <b-card body-class="p-2">nbytrvtryvu</b-card>
      </b-col>
    </b-form-row>
    <b-button>View Schema Definition</b-button>

    <b-form class="pt-3">
      <b-form-group label="Select Schema Definition">
        <b-form-select
          :options="schemaList"
          v-model="selectedSchema"
          value-field="id"
        >
          <template #first>
            <b-form-select-option :value="null" disabled
              >Please select an option
            </b-form-select-option>
          </template>
        </b-form-select>
      </b-form-group>

      <b-form-group
        label="Select Data File"
        :state="dataValidation.success"
        :invalid-feedback="dataValidation.error"
      >
        <FilePicker
          pickerId="join-data-file"
          @join-data-file="validateDataFile($event)"
        />
      </b-form-group>
    </b-form>
  </div>
</template>
<script>
import FilePicker from "@/components/FilePicker";
export default {
  components: {
    FilePicker
  },
  props: {
    schemaList: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      dataFile: null,
      dataValidation: {
        success: null,
        error: null
      },
      selectedSchema: null,
      schemaFile: null
    };
  },
  methods: {
    validateDataFile(file) {
      this.dataFile = file;
      if (file) {
        const result = this.validateJsonDataAgainstSchema(
          file,
          this.schemaFile
        );
        this.dataValidation = result;
      }
    }
  }
};
</script>
<style></style>
