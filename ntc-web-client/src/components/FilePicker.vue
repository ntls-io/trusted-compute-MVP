<template>
  <div>
    <b-button
      v-if="
        !sFile.state || sFile.state === 'success' || sFile.state === 'error'
      "
      block
      variant="outline-secondary"
      @click="selectFile"
      >Select file
    </b-button>
    <b-card v-if="sFile.state" body-class="p-2" class="m-0">
      <b-container fluid class="p-0">
        <b-row no-gutters>
          <b-col>
            {{ sFile.name }}
          </b-col>

          <b-col cols="auto">
            <b-button variant="danger" size="sm">
              <b-icon icon="trash" @click="removeFile"></b-icon>
            </b-button>
          </b-col>
        </b-row>
      </b-container>
    </b-card>

    {{ sFile.file }}
  </div>
</template>

<script>
export default {
  props: {
    pickerId: { type: String, default: "single-picker" }
  },
  mounted() {
    this.$upload.on(this.pickerId, {
      accept: "application/json",
      multiple: false,
      startOnSelect: false,
      extensions: ["json"],
    });
  },
  computed: {
    sFile() {
      const file = this.$upload.file(this.pickerId);
      this.$emit(this.pickerId, file.$file);
      return file;
    }
  },
  methods: {
    selectFile() {
      this.$upload.select(this.pickerId);
    },
    removeFile() {
      this.sFile.clear();
    }
  },
  beforeDestroy() {
    this.$upload.off(this.pickerId);
  }
};
</script>

<style></style>
