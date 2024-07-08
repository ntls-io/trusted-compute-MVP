<template>
  <b-container fluid>
    <b-row>
      <b-col>
        <b-card no-body>
          <b-row class="my-3 mx-1">
            <b-col cols="auto">
              <b-form-group class="m-0">
                <b-form-input type="text" placeholder="Search"></b-form-input>
              </b-form-group>
            </b-col>
          </b-row>

          <b-table
            head-variant="dark"
            borderless
            fixed
            show-empty
            :fields="fields"
            :items="items"
          >
          </b-table>
        </b-card>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
export default {
  data() {
    return {
      fields: [
        "name",
        "description",
        "digital rights",
        { key: "actions", label: "" }
      ],
      items: [
        {
          name: "Aisha",
          description: "Watts",
          "digital rights": "Lorem"
        }
      ]
    };
  }
};
</script>
