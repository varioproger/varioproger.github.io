---
title: Callback plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/callback.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/callback.rst
---

# Callback plugins

Callback plugins enable adding new behaviors to Ansible when responding to events. By default, callback plugins control most of the output you see when running the command line programs, but can also be used to add additional output, integrate with other tools and marshal the events to a storage backend. If necessary, you can create custom callback plugins.

## Example callback plugins

The log_plays callback is an example of how to record playbook events to a log file, and the mail callback sends email on playbook failures.

The say callback responds with a computer-synthesized speech in relation to playbook events.

## Enabling callback plugins

You can activate a custom callback, depending on its `NEEDS_ENABLED` property, by either dropping it into one of the callback directory sources configured in ansible.cfg or in a collection and referencing it in configuration by FQCN.

Plugins are loaded in alphanumeric order. For example, a plugin implemented in a file named <span class="title-ref">1_first.py</span> would run before a plugin file named <span class="title-ref">2_second.py</span>.

Most callbacks shipped with Ansible are disabled by default and need to be enabled in your ansible.cfg file in order to function. For example:

``` ini
#callbacks_enabled = timer, mail, profile_roles, collection_namespace.collection_name.custom_callback
```

## Setting a callback plugin for `ansible-playbook`

You can only have one plugin be the main manager of your console output. If you want to replace the default, you should define `CALLBACK_TYPE = stdout` in the subclass and then configure the stdout plugin in ansible.cfg. For example:

``` ini
stdout_callback = dense
```

or for my custom callback:

``` ini
stdout_callback = mycallback
```

This only affects ansible-playbook by default.

## Setting a callback plugin for ad hoc commands

The ansible ad hoc command specifically uses a different callback plugin for stdout, so there is an extra setting in ansible_configuration_settings you need to add to use the stdout callback defined above:

``` ini
[defaults]
bin_ansible_callbacks=True
```

You can also set this as an environment variable:

``` shell
export ANSIBLE_LOAD_CALLBACK_PLUGINS=1
```

## Types of callback plugins

There are three types of callback plugins:

stdout callback plugins  

> These plugins handle the main console output. Only one can be active. They always get the event first; the rest of the callbacks get the event in the order they are configured.

aggregate callback plugins  

> Aggregate callbacks can add additional console output next to a stdout callback. This can be aggregate information at the end of a playbook run, additional per-task output, or anything else.

notification callback plugins  

> Notification callbacks inform other applications, services, or systems. This can be anything from logging to databases, informing on errors in Instant Messaging applications, or sending emails when a server is unreachable.

## Plugin list

You can use `ansible-doc -t callback -l` to see the list of available plugins.
Use `ansible-doc -t callback <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Action plugins](action.md)
> Action plugins
> [Cache plugins](cache.md)
> Cache plugins
> [Connection plugins](connection.md)
> Connection plugins
> [Inventory plugins](inventory.md)
> Inventory plugins
> [Shell plugins](shell.md)
> Shell plugins
> [Strategy plugins](strategy.md)
> Strategy plugins
> [Vars plugins](vars.md)
> Vars plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
