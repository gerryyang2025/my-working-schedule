import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import PasswordChangeDialog from "./PasswordChangeDialog.vue";

const ElDialogStub = defineComponent({
  name: "ElDialog",
  props: ["modelValue", "title"],
  emits: ["update:modelValue"],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
});

const ElInputStub = defineComponent({
  name: "ElInput",
  props: ["modelValue", "placeholder", "type", "disabled"],
  emits: ["update:modelValue"],
  template:
    '<input :data-testid="$attrs[\'data-testid\']" :placeholder="placeholder" :type="type" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

const ElButtonStub = defineComponent({
  name: "ElButton",
  props: ["type", "disabled", "loading"],
  template: '<button type="button" :disabled="disabled" v-bind="$attrs"><slot /></button>'
});

describe("PasswordChangeDialog", () => {
  it("submits the current and new password after confirmation matches", async () => {
    const wrapper = mount(PasswordChangeDialog, {
      props: {
        modelValue: true,
        loading: false
      },
      global: {
        stubs: {
          ElButton: ElButtonStub,
          ElDialog: ElDialogStub,
          ElInput: ElInputStub
        }
      }
    });

    await wrapper.get('[data-testid="current-password"]').setValue("old-password");
    await wrapper.get('[data-testid="new-password"]').setValue("new-password");
    await wrapper.get('[data-testid="confirm-password"]').setValue("new-password");
    await wrapper.get('[data-testid="submit-password-change"]').trigger("click");

    expect(wrapper.emitted("changePassword")).toEqual([
      [
        {
          currentPassword: "old-password",
          newPassword: "new-password"
        }
      ]
    ]);
  });
});
